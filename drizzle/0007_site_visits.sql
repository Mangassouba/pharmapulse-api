CREATE TABLE "site_visits" (
	"day" date NOT NULL,
	"visitorId" text NOT NULL,
	"createdAt" timestamp (3) DEFAULT now() NOT NULL,
	CONSTRAINT "site_visits_pkey" PRIMARY KEY("day","visitorId")
);
