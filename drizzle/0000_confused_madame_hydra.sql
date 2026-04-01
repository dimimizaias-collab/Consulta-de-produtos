CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"status" text,
	"count" integer DEFAULT 0,
	"location" text,
	"is_featured" boolean DEFAULT false,
	"is_side" boolean DEFAULT false,
	"is_low" boolean DEFAULT false,
	"ean" text,
	"internal_code" text,
	"category" text,
	"subcategory" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
