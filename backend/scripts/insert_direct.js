const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://acjnktdlqupwfeolkrfk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const products = JSON.parse(fs.readFileSync('S:/Machine learning/Startup/Shubham xerox/backend/scripts/products.json', 'utf8'));

async function insertProducts() {
    if (!products || products.length === 0) {
        console.log("No products to insert.");
        return;
    }

    const { data: existingData, error: selectError } = await supabase.from('products').select('name');
    if (selectError) {
        console.error("Error fetching existing products:", selectError);
        return;
    }

    const existingNames = new Set(existingData.map(p => p.name.toLowerCase()));
    const newProducts = products.filter(p => !existingNames.has(p.name.toLowerCase()));

    if (newProducts.length > 0) {
        const { error: insertError } = await supabase.from('products').insert(newProducts);
        if (insertError) {
            console.error("Error inserting products:", insertError);
            if (insertError.message.includes("violates row-level security")) {
                console.error("RLS is preventing insertion with the public key. We must use the backend's service key.");
            }
        } else {
            console.log(`Successfully imported ${newProducts.length} products!`);
        }
    } else {
        console.log("No new products to import.");
    }
}

insertProducts();
