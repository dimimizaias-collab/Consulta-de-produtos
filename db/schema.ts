import { pgTable, text, integer, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  image: text('image'),
  status: text('status'),
  count: integer('count').default(0),
  price: integer('price').default(0),
  location: text('location'),
  isFeatured: boolean('is_featured').default(false),
  isSide: boolean('is_side').default(false),
  isLow: boolean('is_low').default(false),
  ean: text('ean'),
  internalCode: text('internal_code'),
  category: text('category'),
  subcategory: text('subcategory'),
  brand: text('brand'),
  linkedProductId: uuid('linked_product_id').references((): any => products.id),
  isMother: boolean('is_mother').default(false),
  unitsPerMother: integer('units_per_mother').default(1),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const requests = pgTable('requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id),
  requestedChanges: text('requested_changes'), // JSON string
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  createdAt: timestamp('created_at').defaultNow(),
});
