const fs = require('fs');

const SUPABASE_URL = 'https://acjnktdlqupwfeolkrfk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_q3zriGbom5L-kdt5ILtlvw_69i5nUj5';

const products = JSON.parse(fs.readFileSync('S:/Machine learning/Startup/Shubham xerox/backend/scripts/products.json', 'utf8'));

async function insertProducts() {
    if (!products || products.length === 0) {
        console.log("No products to insert.");
        return;
    }

    try {
        // Fetch existing products
        const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=name`, {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        
        if (!res.ok) {
            console.error("Error fetching existing products:", await res.text());
            return;
        }

        const existingData = await res.json();
        const existingNames = new Set(existingData.map(p => p.name.toLowerCase()));
        const newProducts = products.filter(p => !existingNames.has(p.name.toLowerCase()));

        if (newProducts.length > 0) {
            const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
                method: 'POST',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(newProducts)
            });

            if (!insertRes.ok) {
                console.error("Error inserting products:", await insertRes.text());
            } else {
                console.log(`Successfully imported ${newProducts.length} products!`);
            }
        } else {
            console.log("No new products to import.");
        }
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

insertProducts();
