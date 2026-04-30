import re

with open('assets/js/script.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Chat files
old_chat = """  const { data, error } = await supabase.storage.from('chat-files').upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) {"""
new_chat = """  const { data, error } = await supabase.storage.from('chat-files').upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (!error) {
    fetch(window.API_BASE_URL + "/compress-pdf", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucket: "chat-files", file_name: fileName })
    }).catch(e => console.error(e));
  }

  if (error) {"""
content = content.replace(old_chat, new_chat)

# 2. Free notes direct upload
old_free = """      const { error: uploadError } = await supabase.storage.from('free-notes').upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {"""
new_free = """      const { error: uploadError } = await supabase.storage.from('free-notes').upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (!uploadError) {
        fetch(window.API_BASE_URL + "/compress-pdf", {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket: "free-notes", file_name: fileName })
        }).catch(e => console.error(e));
      }

      if (uploadError) {"""
content = content.replace(old_free, new_free)

# 3. Photocopy docs
old_photo = """          const { error: upErr } = await supabase.storage
            .from('photocopy-docs')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: file.type || 'application/pdf'
            });

          if (upErr) {"""
new_photo = """          const { error: upErr } = await supabase.storage
            .from('photocopy-docs')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: true,
              contentType: file.type || 'application/pdf'
            });

          if (!upErr) {
            fetch(window.API_BASE_URL + "/compress-pdf", {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bucket: "photocopy-docs", file_name: path })
            }).catch(e => console.error(e));
          }

          if (upErr) {"""
content = content.replace(old_photo, new_photo)

with open('assets/js/script.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Replaced triggers successfully")
