
-- Rename "Site Visit" to "Site Visit/Survey Work"
UPDATE activity_types_master SET name = 'Site Visit/Survey Work' WHERE id = 'd34e346b-68ae-4893-9502-e1774afca635';

-- Deactivate "Survey Work"
UPDATE activity_types_master SET is_active = false WHERE id = 'e166b7cf-f79f-4860-b2a8-6df6650e7af8';

-- Update existing activity_events that reference "Survey Work" or "Site Visit"
UPDATE activity_events SET activity_type = 'Site Visit/Survey Work' WHERE activity_type IN ('Site Visit', 'Survey Work');
