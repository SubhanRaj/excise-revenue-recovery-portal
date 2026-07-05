import csv
import hashlib
import re

# District mapping from Hindi to English (must match seed.sql exactly)
mapping = {
    'प्रयागराज': 'Prayagraj',
    'फतेहपुर': 'Fatehpur',
    'कौशाम्बी': 'Kaushambi',
    'प्रतापगढ़': 'Pratapgarh',
    'प्रतापगढ': 'Pratapgarh',
    'वाराणसी': 'Varanasi',
    'चंदौली': 'Chandauli',
    'जौनपुर': 'Jaunpur',
    'गाजीपुर': 'Ghazipur',
    'मिर्जापुर': 'Mirzapur',
    'सोनभद्र': 'Sonbhadra',
    'संत रविदासनगर भदोही': 'Bhadohi',
    'भदोही': 'Bhadohi',
    'आजमगढ़': 'Azamgarh',
    'आजमगढ': 'Azamgarh',
    'मऊ': 'Mau',
    'बलिया': 'Ballia',
    'गोरखपुर': 'Gorakhpur',
    'देवरिया': 'Deoria',
    'कुशीनगर': 'Kushinagar',
    'महराजगंज': 'Maharajganj',
    'बस्ती': 'Basti',
    'सिद्धार्थनगर': 'Siddharthnagar',
    'संतकबीरनगर': 'Sant Kabir Nagar',
    'संत कबीर नगर': 'Sant Kabir Nagar',
    'अयोध्या': 'Ayodhya',
    'सुल्तानपुर': 'Sultanpur',
    'बाराबंकी': 'Barabanki',
    'अम्बेडकरनगर': 'Ambedkar Nagar',
    'अम्बेडकर नगर': 'Ambedkar Nagar',
    'अमेठी': 'Amethi',
    'गोण्डा': 'Gonda',
    'बलरामपुर': 'Balrampur',
    'बहराइच': 'Bahraich',
    'श्रावस्ती': 'Shravasti',
    'लखनऊ': 'Lucknow',
    'रायबरेली': 'Raebareli',
    'उन्नाव': 'Unnao',
    'लखीमपुर खीरी': 'Lakhimpur Kheri',
    'लखीमपुर': 'Lakhimpur Kheri',
    'हरदोई': 'Hardoi',
    'सीतापुर': 'Sitapur',
    'बरेली': 'Bareilly',
    'बदायूँ': 'Budaun',
    'पीलीभीत': 'Pilibhit',
    'शाहजहाँपुर': 'Shahjahanpur',
    'मुरादाबाद': 'Moradabad',
    'रामपुर': 'Rampur',
    'बिजनौर': 'Bijnor',
    'अमरोहा': 'Amroha',
    'मेरठ': 'Meerut',
    'गाजियाबाद': 'Ghaziabad',
    'बागपत': 'Baghpat',
    'गौतमबुद्धनगर': 'Gautam Buddha Nagar',
    'गौतम बुद्ध नगर': 'Gautam Buddha Nagar',
    'बुलन्दशहर': 'Bulandshahr',
    'हापुड़': 'Hapur',
    'हापुड': 'Hapur',
    'सहारनपुर': 'Saharanpur',
    'मुजफ्फरनगर': 'Muzaffarnagar',
    'शामली': 'Shamli',
    'आगरा': 'Agra',
    'फिरोजाबाद': 'Firozabad',
    'मथुरा': 'Mathura',
    'अलीगढ़': 'Aligarh',
    'एटा': 'Etah',
    'कासगंज': 'Kasganj',
    'हाथरस': 'Hathras',
    'झाँसी': 'Jhansi',
    'झांसी': 'Jhansi',
    'ललितपुर': 'Lalitpur',
    'जालौन': 'Jalaun',
    'बाँदा': 'Banda',
    'बांदा': 'Banda',
    'हमीरपुर': 'Hamirpur',
    'चित्रकूट': 'Chitrakoot',
    'महोबा': 'Mahoba',
    'कानपुर नगर': 'Kanpur Nagar',
    'कानपुर देहात': 'Kanpur Dehat',
    'कन्नौज': 'Kannauj',
    'इटावा': 'Etawah',
    'फर्रुखाबाद': 'Farrukhabad',
    'औरैया': 'Auraiya',
    'औरया': 'Auraiya',
    'मैनपुरी': 'Mainpuri',
    'सम्भल': 'Sambhal',
    'संभल': 'Sambhal'
}

# 1. Parse seed.sql to get ordered districts and assign district_id
districts = []
with open('../api/drizzle/seed.sql', 'r') as f:
    sql = f.read()
    matches = re.findall(r"\('(.*?)'\)", sql)
    for match in matches:
        if match != 'admin' and match != 'shubhanraj2002@gmail.com':
            districts.append(match)

district_ids = {name: i + 1 for i, name in enumerate(districts)}
print(f"Loaded {len(district_ids)} districts from seed.sql")

# 2. Extract CUGs and Emails
deo_data = {}

def get_eng_dist(designation):
    dist_name = designation.replace('जिला आबकारी अधिकारी', '').replace(',', '').strip()
    return mapping.get(dist_name)

# Parse contact.csv
with open('contact.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        designation = row['पद नाम'].strip()
        cug = row['सी०यू०जी०'].strip()
        if 'जिला आबकारी अधिकारी' in designation:
            eng_dist = get_eng_dist(designation)
            if not eng_dist:
                print(f"contact.csv WARNING: No mapping found for {designation}")
                continue
            
            if cug and len(cug) == 10 and cug.startswith('94544'):
                cug_hash = hashlib.sha256(cug.encode('utf-8')).hexdigest()
                if eng_dist not in deo_data:
                    deo_data[eng_dist] = {}
                deo_data[eng_dist]['cug_hash'] = cug_hash
            else:
                print(f"contact.csv WARNING: Invalid CUG for {eng_dist}: {cug}")

# Parse emails.csv
# Format appears to be: "जिला आबकारी अधिकारी, मुजफ्फरनगर",deomzfupexcise1@gmail.com
with open('emails.csv', 'r', encoding='utf-8') as f:
    # No header in emails.csv, so we use reader
    reader = csv.reader(f)
    for row in reader:
        if len(row) < 2:
            continue
        designation = row[0].strip()
        email = row[1].strip()
        if 'जिला आबकारी अधिकारी' in designation:
            eng_dist = get_eng_dist(designation)
            if not eng_dist:
                print(f"emails.csv WARNING: No mapping found for {designation}")
                continue
            
            if email:
                if eng_dist not in deo_data:
                    deo_data[eng_dist] = {}
                deo_data[eng_dist]['email'] = email
            else:
                print(f"emails.csv WARNING: Invalid email for {eng_dist}: {email}")

# 3. Generate INSERT INTO users statements
sql_statements = ["-- Auto-generated DEO inserts from contact.csv and emails.csv\n"]

for eng_dist, data in deo_data.items():
    if eng_dist not in district_ids:
        print(f"WARNING: District {eng_dist} not found in database schema!")
        continue
        
    dist_id = district_ids[eng_dist]
    cug_hash = data.get('cug_hash', '')
    email = data.get('email', '')
    
    if cug_hash and email:
        sql = f"INSERT INTO users (role, email, cug_hash, district_id) VALUES ('deo', '{email}', '{cug_hash}', {dist_id});"
        sql_statements.append(sql)
    else:
        print(f"WARNING: Missing data for {eng_dist} - CUG: {bool(cug_hash)}, Email: {bool(email)}")

# Write to update_cug.sql
with open('update_cug.sql', 'w') as f:
    f.write("\n".join(sql_statements))
    f.write("\n")

print(f"Generated {len(sql_statements) - 1} INSERT statements in update_cug.sql")
