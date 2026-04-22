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

export const suppliers = pgTable('suppliers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const purchaseOrders = pgTable('purchase_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  supplierId: uuid('supplier_id').references(() => suppliers.id),
  status: text('status').default('draft'), // 'draft', 'finalized', 'canceled'
  totalItems: integer('total_items').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const purchaseOrderItems = pgTable('purchase_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => purchaseOrders.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').notNull(),
  supplierSku: text('supplier_sku'),
  supplierDescription: text('supplier_description'),
  createdAt: timestamp('created_at').defaultNow(),
});
