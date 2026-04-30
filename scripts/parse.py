import re
import urllib.parse

html_string = """<div class="header-categories"><a class="category-item" href="/categories/shree-sundaram-academy-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1776534680454.jpg?height=92&amp;format=webp" alt="Shree Sundaram Academy" class="category-icon"><span class="category-label">Shree Sundaram Academy</span></a><a class="category-item" href="/categories/mahaveer-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1775153493786.png?height=92&amp;format=webp" alt="MAHAVEER PUBLICATION" class="category-icon"><span class="category-label">MAHAVEER PUBLICATION</span></a><a class="category-item" href="/categories/exampedia-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774347850124.jpg?height=92&amp;format=webp" alt="Exampedia Publication" class="category-icon"><span class="category-label">Exampedia Publication</span></a><a class="category-item" href="/categories/mppsc-special-test-series-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774378106919.jpg?height=92&amp;format=webp" alt="MPPSC SPECIAL TEST SERIES" class="category-icon"><span class="category-label">MPPSC SPECIAL TEST SERIES</span></a><a class="category-item" href="/categories/parikshavani-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1770058144723.png?height=92&amp;format=webp" alt="Parikshavani Publication" class="category-icon"><span class="category-label">Parikshavani Publication</span></a><a class="category-item" href="/categories/champion-squre-notes-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1763837117023.jpg?height=92&amp;format=webp" alt="Champion Squre Notes" class="category-icon"><span class="category-label">Champion Squre Notes</span></a><a class="category-item" href="/categories/nirman-ias-notes-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1743326431204.jpg?height=92&amp;format=webp" alt="NIRMAN IAS NOTES" class="category-icon"><span class="category-label">NIRMAN IAS NOTES</span></a><a class="category-item" href="/categories/tathyabaan-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774379294511.jpg?height=92&amp;format=webp" alt="TATHYABAAN PUBLICATION" class="category-icon"><span class="category-label">TATHYABAAN PUBLICATION</span></a><a class="category-item" href="/categories/parikshamdham-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1754810090869.jpg?height=92&amp;format=webp" alt="PARIKSHAMDHAM PUBLICATION" class="category-icon"><span class="category-label">PARIKSHAMDHAM PUBLICATION</span></a><a class="category-item" href="/categories/pariksha-dham-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774377869798.jpg?height=92&amp;format=webp" alt="AAKAR IAS HINDI MEDIUM" class="category-icon"><span class="category-label">AAKAR IAS HINDI MEDIUM</span></a><a class="category-item" href="/categories/aakar-ias-mains-hindi-medium-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774378056536.jpg?height=92&amp;format=webp" alt="AAKAR IAS MAINS HINDI MEDIUM" class="category-icon"><span class="category-label">AAKAR IAS MAINS HINDI MEDIUM</span></a><a class="category-item" href="/categories/aakar-ias-english-medium-notes-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774378083942.jpg?height=92&amp;format=webp" alt="AAKAR IAS ENGLISH MEDIUM NOTES" class="category-icon"><span class="category-label">AAKAR IAS ENGLISH MEDIUM NOTES</span></a><a class="category-item" href="/categories/drishty-ias-notes-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1743660506891.jpg?height=92&amp;format=webp" alt="DRISHTI IAS NOTES" class="category-icon"><span class="category-label">DRISHTI IAS NOTES</span></a><a class="category-item" href="/categories/drishti-ias-english-medium-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1776364323653.jpg?height=92&amp;format=webp" alt="Drishti Ias English Medium" class="category-icon"><span class="category-label">Drishti Ias English Medium</span></a><a class="category-item" href="/categories/parmar-ssc-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1750098700556.jpg?height=92&amp;format=webp" alt="PARMAR SSC" class="category-icon"><span class="category-label">PARMAR SSC</span></a><a class="category-item" href="/categories/selection-tak-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1744048996571.jpg?height=92&amp;format=webp" alt="SELECTION TAK PUBLICATION" class="category-icon"><span class="category-label">SELECTION TAK PUBLICATION</span></a><a class="category-item" href="/categories/koutilya-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774379316585.jpg?height=92&amp;format=webp" alt="CIVIL JOBS COCHING NOTES" class="category-icon"><span class="category-label">CIVIL JOBS COCHING NOTES</span></a><a class="category-item" href="/categories/mayank-sir-hindi-anmm-sepcial-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1776364346866.jpg?height=92&amp;format=webp" alt="DEVNAGARI PUBLICATION" class="category-icon"><span class="category-label">DEVNAGARI PUBLICATION</span></a><a class="category-item" href="/categories/darpan-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774379341258.jpg?height=92&amp;format=webp" alt="DARPAN PUBLICATION" class="category-icon"><span class="category-label">DARPAN PUBLICATION</span></a><a class="category-item" href="/categories/winners-institute-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1745547472874.jpg?height=92&amp;format=webp" alt="WINNERS INSTITUTE" class="category-icon"><span class="category-label">WINNERS INSTITUTE</span></a><a class="category-item" href="/categories/shree-kabir-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774379863295.jpg?height=92&amp;format=webp" alt="Shree Kabir Publication" class="category-icon"><span class="category-label">Shree Kabir Publication</span></a><a class="category-item" href="/categories/utkarsh-classes-notes-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1743483680701.jpg?height=92&amp;format=webp" alt="UTKARSH CLASSES NOTES" class="category-icon"><span class="category-label">UTKARSH CLASSES NOTES</span></a><a class="category-item" href="/categories/mp-tet-books-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1746119040041.jpg?height=92&amp;format=webp" alt="MP TET ALL PUBLICATION BOOKS" class="category-icon"><span class="category-label">MP TET ALL PUBLICATION BOOKS</span></a><a class="category-item" href="/categories/pinnacle-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1747238181495.jpg?height=92&amp;format=webp" alt="Pinnacle Publication" class="category-icon"><span class="category-label">Pinnacle Publication</span></a><a class="category-item" href="/categories/youth-compition-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1745255575383.jpg?height=92&amp;format=webp" alt="Youth Compition Publication" class="category-icon"><span class="category-label">Youth Compition Publication</span></a><a class="category-item" href="/categories/arihant-pub-capsule-series-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1753374313517.jpg?height=92&amp;format=webp" alt="Arihant Pub. Capsule Series" class="category-icon"><span class="category-label">Arihant Pub. Capsule Series</span></a><a class="category-item" href="/categories/ignite-arihant-upsc-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1746725555972.jpg?height=92&amp;format=webp" alt="IGNITE UPSC ARIHANT PUBLICATION" class="category-icon"><span class="category-label">IGNITE UPSC ARIHANT PUBLICATION</span></a><a class="category-item" href="/categories/arihant-publication-ugc-nta-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1746204168875.jpg?height=92&amp;format=webp" alt="ARIHANT PUBLICATION UGC NTA" class="category-icon"><span class="category-label">ARIHANT PUBLICATION UGC NTA</span></a><a class="category-item" href="/categories/peb-व्यापम-सभी-परीक्षा-बुक्स-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1745490441191.jpg?height=92&amp;format=webp" alt="PEB (व्यापम) सभी परीक्षा बुक्स" class="category-icon"><span class="category-label">PEB (व्यापम) सभी परीक्षा बुक्स</span></a><a class="category-item" href="/categories/satyadhi-sharma-classes-notes-285520-549"><img src="https://img.clevup.in/285520/cat/291313_cat-1753980988074.png?height=92&amp;format=webp" alt="Satyadhi Sharma Classes Notes" class="category-icon"><span class="category-label">Satyadhi Sharma Classes Notes</span></a><a class="category-item" href="/categories/arihant-publication-ssc-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1745647649162.jpg?height=92&amp;format=webp" alt="ARIHANT PUBLICATION SSC" class="category-icon"><span class="category-label">ARIHANT PUBLICATION SSC</span></a><a class="category-item" href="/categories/railway-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1745308239913.jpg?height=92&amp;format=webp" alt="Railway Special Books" class="category-icon"><span class="category-label">Railway Special Books</span></a><a class="category-item" href="/categories/arihant-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1743609051295.jpg?height=92&amp;format=webp" alt="ARIHANT PUBLICATION" class="category-icon"><span class="category-label">ARIHANT PUBLICATION</span></a><a class="category-item" href="/categories/disha-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1744770532535.jpg?height=92&amp;format=webp" alt="Disha Publication" class="category-icon"><span class="category-label">Disha Publication</span></a><a class="category-item" href="/categories/arihant-hand-written-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1769624090137.jpg?height=92&amp;format=webp" alt="MPPSC PRELIMS HAND WRITTEN 2.0" class="category-icon"><span class="category-label">MPPSC PRELIMS HAND WRITTEN 2.0</span></a><a class="category-item" href="/categories/mpgk-special-collection--285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1743705430138.jpg?height=92&amp;format=webp" alt="MPGK (SPECIAL COLLECTION )" class="category-icon"><span class="category-label">MPGK (SPECIAL COLLECTION )</span></a><a class="category-item" href="/categories/ghatna-chakra-purvavlokan-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774380204236.jpg?height=92&amp;format=webp" alt="Ghatna Chakra Publication" class="category-icon"><span class="category-label">Ghatna Chakra Publication</span></a><a class="category-item" href="/categories/upsc-sepicial-books-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1774380262222.jpg?height=92&amp;format=webp" alt="UPSC SEPICIAL BOOKS" class="category-icon"><span class="category-label">UPSC SEPICIAL BOOKS</span></a><a class="category-item" href="/categories/tmh-publication--m-laxmikant-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1776364531772.png?height=92&amp;format=webp" alt="TMH PUBLICATION" class="category-icon"><span class="category-label">TMH PUBLICATION</span></a><a class="category-item" href="/categories/punekar-publication-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1748020109775.jpg?height=92&amp;format=webp" alt="PUNEKAR PUBLICATION" class="category-icon"><span class="category-label">PUNEKAR PUBLICATION</span></a><a class="category-item" href="/categories/gagan-pratap-sir-all-books-285520"><img src="https://img.clevup.in/285520/cat/291313_cat-1747539300152.jpg?height=92&amp;format=webp" alt="GAGAN PRATAP Sir All Books" class="category-icon"><span class="category-label">GAGAN PRATAP Sir All Books</span></a></div>"""

pattern = r'<img src="(.*?)" alt="(.*?)" class="category-icon">'

matches = re.findall(pattern, html_string)

html_output = '<section class="section" style="padding-top: 32px; padding-bottom: 0;">\n  <div class="container">\n    <h2 class="section-title" style="margin-bottom: 16px;">Top Publishers</h2>\n    <div class="image-categories-container">\n'

for img_src, alt_text in matches:
    # replace amp; with empty string just in case
    img_src = img_src.replace('&amp;', '&')
    search_url = f"products.html?strict=true&search={urllib.parse.quote(alt_text)}"
    html_output += f"""      <a class="image-category-item" href="{search_url}">
        <div class="img-wrapper">
          <img src="{img_src}" alt="{alt_text}" loading="lazy">
        </div>
        <span class="category-label">{alt_text}</span>
      </a>\n"""

html_output += '    </div>\n  </div>\n</section>'

with open("s:/Machine learning/Startup/Shubham xerox/parsed_categories.html", "w", encoding="utf-8") as f:
    f.write(html_output)

css_output = """
/* Image Categories Slider */
.image-categories-container {
  display: flex;
  overflow-x: auto;
  gap: 16px;
  padding: 8px 4px 20px 4px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.image-categories-container::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.image-category-item {
  flex: 0 0 auto;
  width: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  scroll-snap-align: start;
  gap: 8px;
  transition: transform 0.2s ease;
}

.image-category-item:hover {
  transform: translateY(-4px);
}

.image-category-item .img-wrapper {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--card-bg);
  border: 2px solid var(--border-color);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
}

.image-category-item img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 50%;
}

.image-category-item .category-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: center;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
"""

with open("s:/Machine learning/Startup/Shubham xerox/parsed_categories_css.txt", "w", encoding="utf-8") as f:
    f.write(css_output)

print("Done")
