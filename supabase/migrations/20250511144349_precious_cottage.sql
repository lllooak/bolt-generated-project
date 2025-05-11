/*
  # Add video_ad_id to requests table
  
  1. Changes
    - Add video_ad_id column to requests table
    - Add foreign key constraint to video_ads table
    - Add index for performance
*/

-- Add video_ad_id column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'requests' 
    AND column_name = 'video_ad_id'
  ) THEN
    ALTER TABLE requests 
    ADD COLUMN video_ad_id uuid REFERENCES video_ads(id);
    
    -- Add index for foreign key
    CREATE INDEX IF NOT EXISTS idx_requests_video_ad_id 
    ON requests(video_ad_id);
  END IF;
END $$;
