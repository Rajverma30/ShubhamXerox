import re

with open('assets/js/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_desc = """              <div style="margin-bottom: 40px;">
                <h3 style="font-size: 1.5rem; margin-bottom: 16px;">Book Description</h3>
                <p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.8;">${pDesc}</p>
              </div>"""

new_desc = """              <div style="margin-bottom: 40px;">
                <h3 style="font-size: 1.5rem; margin-bottom: 16px;">Book Description</h3>
                <p style="color: var(--text-muted); font-size: 1.1rem; line-height: 1.8;">${pDesc}</p>
              </div>
              
              ${attachedPdfHtml}"""

content = content.replace(old_desc, new_desc)

old_vars = """        const pDesc = product.desc || `Premium quality ${product.category.toLowerCase()} available for you at Shubham Xerox. Perfect for your exam preparation with clear printing and accurate content.`;"""

new_vars = """        const pDesc = product.desc || `Premium quality ${product.category.toLowerCase()} available for you at Shubham Xerox. Perfect for your exam preparation with clear printing and accurate content.`;
        
        let attachedPdfHtml = '';
        if (product.free_note_id && window.supabase) {
          try {
            const { data: noteData } = await supabase.from('free_notes').select('*').eq('id', product.free_note_id).single();
            if (noteData) {
              const priceText = noteData.is_paid ? `Buy PDF (₹${noteData.price})` : `Download Free PDF`;
              const onClickAction = noteData.is_paid 
                ? `window.location.href='checkout.html?type=pdf&title=${encodeURIComponent(noteData.title)}&price=${noteData.price}&url=${encodeURIComponent(noteData.file_url)}'`
                : `window.open('${noteData.file_url}', '_blank')`;
                
              attachedPdfHtml = `
              <div style="background: rgba(var(--primary-rgb), 0.05); border: 1px solid var(--border-color); padding: 20px; border-radius: 8px; margin-bottom: 40px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
                <div>
                  <h3 style="font-size: 1.2rem; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    Digital PDF Attached
                  </h3>
                  <p style="color: var(--text-muted); font-size: 0.95rem;">${noteData.title}</p>
                </div>
                <button class="btn ${noteData.is_paid ? 'btn-primary' : 'btn-outline-primary'}" onclick="${onClickAction}">
                  ${priceText}
                </button>
              </div>
              `;
            }
          } catch(e) { console.error("Error fetching attached PDF", e); }
        }
"""

content = content.replace(old_vars, new_vars)

with open('assets/js/script.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced successfully")
