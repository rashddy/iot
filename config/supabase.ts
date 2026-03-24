/**
 * AquaFeed Pro – Supabase configuration
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hhqrukpscpohrtmrvvvq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocXJ1a3BzY3BvaHJ0bXJ2dnZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzgzNjQsImV4cCI6MjA4OTkxNDM2NH0.E_yezcYwEy3LzNE4PgvXQJazQbPv_p73rUQOaiVthEs';

export const supabase = createClient(supabaseUrl, supabaseKey);
