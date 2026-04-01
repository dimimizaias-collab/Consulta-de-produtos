import { pgTable, text, integer, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  image: text('image'),
  status: text('status'),
  count: integer('count').default(0),
  location: text('location'),
  isFeatured: boolean('is_featured').default(false),
  isSide: boolean('is_side').default(false),
  isLow: boolean('is_low').default(false),
  ean: text('ean'),
  internalCode: text('internal_code'),
  category: text('category'),
  subcategory: text('subcategory'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
