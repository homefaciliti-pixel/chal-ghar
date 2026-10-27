USE cab_user_app;
INSERT INTO vehicle_types (vehicle_type_id,name,icon_url,capacity,base_fare,per_km,per_minute,nearest_eta_minutes,is_available)
VALUES
('BIKE','Bike','https://cdn-icons-png.flaticon.com/512/3198/3198344.png',1,25,8,0.5,2,TRUE),
('AUTO','Auto','https://cdn-icons-png.flaticon.com/512/3202/3202926.png',3,35,12,1,3,TRUE),
('MINI','Mini Cab','https://cdn-icons-png.flaticon.com/512/75/75780.png',4,50,14,1.5,5,TRUE),
('SEDAN','Sedan Prime','https://cdn-icons-png.flaticon.com/512/3202/3202926.png',4,70,18,2,7,TRUE),
('CAB','Cab','https://cdn-icons-png.flaticon.com/512/75/75780.png',4,50,14,1.5,6,TRUE),
('vt_auto','Auto','https://cdn-icons-png.flaticon.com/512/3202/3202926.png',3,35,12,1,4,TRUE),
('vt_bike','Bike','https://cdn-icons-png.flaticon.com/512/3198/3198344.png',1,25,8,0.5,3,TRUE),
('vt_cab','Cab','https://cdn-icons-png.flaticon.com/512/75/75780.png',4,50,14,1,6,TRUE)
ON DUPLICATE KEY UPDATE name=VALUES(name);
INSERT INTO cities (city_id,city_name,min_lat,max_lat,min_lng,max_lng,is_active)
VALUES ('city_jpr','Jaipur',26.70,27.10,75.60,76.00,TRUE)
ON DUPLICATE KEY UPDATE city_name=VALUES(city_name),is_active=TRUE;
INSERT INTO promos (code,title,description,discount_type,discount_value,max_discount,min_fare,valid_till,terms,is_active)
VALUES ('WELCOME50','Welcome offer','Sample development promo','FLAT',50,50,100,NULL,'Development seed; configure actual validity and terms.',TRUE)
ON DUPLICATE KEY UPDATE title=VALUES(title),is_active=TRUE;
