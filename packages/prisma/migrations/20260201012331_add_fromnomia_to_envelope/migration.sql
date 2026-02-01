-- AlterTable
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Envelope') THEN
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'Envelope' AND column_name = 'fromNomia') THEN
            ALTER TABLE "Envelope" ADD COLUMN "fromNomia" BOOLEAN DEFAULT false;
        END IF;
    END IF;
END $$;
