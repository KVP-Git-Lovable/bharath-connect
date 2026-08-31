
ALTER TABLE activity_types_master ADD COLUMN sort_order integer NOT NULL DEFAULT 100;

UPDATE activity_types_master SET sort_order = 10 WHERE name = 'Contractor Meeting';
UPDATE activity_types_master SET sort_order = 20 WHERE name = 'Material Inspection';
UPDATE activity_types_master SET sort_order = 30 WHERE name = 'Site Visit/Survey Work';
UPDATE activity_types_master SET sort_order = 40 WHERE name = 'Office Work';
UPDATE activity_types_master SET sort_order = 50 WHERE name = 'Other';
