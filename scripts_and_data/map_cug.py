import csv
import hashlib
import json
import re

# District mapping from Hindi to English (as in import.sql)
# I will populate this based on the extraction
mapping = {
    'प्रयागराज': 'Allahabad',
    'फतेहपुर': 'Fatehpur',
    'कौशाम्बी': 'Kaushambi',
    'प्रतापगढ़': 'Pratapgarh',
    'वाराणसी': 'Varanasi',
    'चंदौली': 'Chandauli',
    'जौनपुर': 'Jaunpur',
    'गाजीपुर': 'Ghazipur',
    'मिर्जापुर': 'Mirzapur',
    'सोनभद्र': 'Sonbhadra',
    'संत रविदासनगर भदोही': 'Bhadohi',
    'आजमगढ़': 'Azamgarh',
    'मऊ': 'Mau',
    'बलिया': 'Ballia',
    'गोरखपुर': 'Gorakhpur',
    'देवरिया': 'Deoria',
    'कुशीनगर': 'Kushinagar', # Is Kushinagar in import.sql? 
    'महराजगंज': 'Maharajganj', # Is Maharajganj in import.sql?
    'बस्ती': 'Basti',
    'सिद्धार्थनगर': 'Siddharthnagar',
    'संतकबीरनगर': 'Sant Kabir Nagar',
    'अयोध्या': 'Ayodhya',
    'सुल्तानपुर': 'Sultanpur',
    'बाराबंकी': 'Barabanki',
    'अम्बेडकरनगर': 'Ambedkar Nagar',
    'अमेठी': 'Amethi',
    'गोण्डा': 'Gonda',
    'बलरामपुर': 'Balrampur',
    'बहराइच': 'Bahraich',
    'श्रावस्ती': 'Shravasti',
    'लखनऊ': 'Lucknow',
    'रायबरेली': 'Raebareli',
    'उन्नाव': 'Unnao',
    'लखीमपुर खीरी': 'Kheri',
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
    'बुलन्दशहर': 'Bulandshahr',
    'हापुड़': 'Hapur',
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
    'ललितपुर': 'Lalitpur',
    'जालौन': 'Jalaun',
    'बाँदा': 'Banda',
    'हमीरपुर': 'Hamirpur',
    'चित्रकूट': 'Chitrakoot',
    'महोबा': 'Mahoba',
    'कानपुर नगर': 'Kanpur Nagar',
    'कानपुर देहात': 'Kanpur Dehat',
    'कन्नौज': 'Kannauj',
    'इटावा': 'Etawah',
    'फर्रुखाबाद': 'Farrukhabad',
    'औरैया': 'Auraiya',
    'मैनपुरी': 'Mainpuri'
}

valid_districts = set([
    'Agra', 'Aligarh', 'Allahabad', 'Ambedkar Nagar', 'Amethi', 'Ayodhya', 'Azamgarh', 
    'Baghpat', 'Bahraich', 'Ballia', 'Balrampur', 'Barabanki', 'Bareilly',
    'Bhadohi', 'Bijnor', 'Bulandshahr', 'Chandauli', 'Deoria', 'Etah', 'Etawah', 
    'Farrukhabad', 'Fatehpur', 'Firozabad', 'Ghazipur', 'Gonda', 'Gorakhpur', 'Hardoi', 
    'Jalaun', 'Jaunpur', 'Jhansi', 'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar', 'Kasganj', 
    'Kaushambi', 'Kheri', 'Lalitpur', 'Lucknow', 'Mahoba', 'Mainpuri', 'Mathura', 'Mau', 
    'Meerut', 'Mirzapur', 'Muzaffarnagar', 'Pratapgarh', 'Raebareli', 'Saharanpur', 
    'Sant Kabir Nagar', 'Shahjahanpur', 'Shamli', 'Shravasti', 'Siddharthnagar', 
    'Sitapur', 'Sonbhadra', 'Sultanpur', 'Unnao', 'Varanasi'
])

sql_statements = []

with open('contact.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        designation = row['पद नाम'].strip()
        cug = row['सी०यू०जी०'].strip()
        
        # We only care about district excise officer
        if 'जिला आबकारी अधिकारी' in designation:
            # Extract district name
            dist_name = designation.replace('जिला आबकारी अधिकारी', '').replace(',', '').strip()
            
            # Map to english
            eng_dist = mapping.get(dist_name)
            
            if not eng_dist:
                print(f"WARNING: No mapping found for {dist_name}")
                continue
                
            if eng_dist not in valid_districts:
                print(f"Skipping {eng_dist} (Not in import.sql)")
                continue
                
            if cug and len(cug) == 10 and cug.startswith('94544'):
                # Hash CUG
                cug_hash = hashlib.sha256(cug.encode('utf-8')).hexdigest()
                
                # Create SQL
                sql = f"UPDATE excise_dues SET cug_hash = '{cug_hash}' WHERE district_name = '{eng_dist}';"
                sql_statements.append(sql)
            else:
                print(f"Invalid CUG for {eng_dist}: {cug}")

# Write to SQL file
with open('api/update_cug.sql', 'w') as f:
    f.write("\n".join(sql_statements))
    f.write("\n")

print(f"Generated {len(sql_statements)} update statements in api/update_cug.sql")
