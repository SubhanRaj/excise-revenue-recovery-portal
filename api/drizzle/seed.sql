-- 75 districts of Uttar Pradesh. Run once against a fresh D1 database.
INSERT INTO districts (district_name) VALUES
('Agra'), ('Aligarh'), ('Prayagraj'), ('Ambedkar Nagar'), ('Amethi'),
('Amroha'), ('Auraiya'), ('Ayodhya'), ('Azamgarh'), ('Baghpat'),
('Bahraich'), ('Ballia'), ('Balrampur'), ('Banda'), ('Barabanki'),
('Bareilly'), ('Basti'), ('Bhadohi'), ('Bijnor'), ('Budaun'),
('Bulandshahr'), ('Chandauli'), ('Chitrakoot'), ('Deoria'), ('Etah'),
('Etawah'), ('Farrukhabad'), ('Fatehpur'), ('Firozabad'), ('Gautam Buddha Nagar'),
('Ghaziabad'), ('Ghazipur'), ('Gonda'), ('Gorakhpur'), ('Hamirpur'),
('Hapur'), ('Hardoi'), ('Hathras'), ('Jalaun'), ('Jaunpur'),
('Jhansi'), ('Kannauj'), ('Kanpur Dehat'), ('Kanpur Nagar'), ('Kasganj'),
('Kaushambi'), ('Kheri'), ('Kushinagar'), ('Lalitpur'), ('Lucknow'),
('Maharajganj'), ('Mahoba'), ('Mainpuri'), ('Mathura'), ('Mau'),
('Meerut'), ('Mirzapur'), ('Moradabad'), ('Muzaffarnagar'), ('Pilibhit'),
('Pratapgarh'), ('Raebareli'), ('Rampur'), ('Saharanpur'), ('Sambhal'),
('Sant Kabir Nagar'), ('Shahjahanpur'), ('Shamli'), ('Shravasti'), ('Siddharthnagar'),
('Sitapur'), ('Sonbhadra'), ('Sultanpur'), ('Unnao'), ('Varanasi');

-- Bootstrap superadmin — sign in via Magic Link, then provision DEO users manually per district
-- (cug_hash = SHA-256 of their 10-digit CUG mobile number, computed client-side).
INSERT INTO users (role, email) VALUES ('admin', 'shubhanraj2002@gmail.com');
