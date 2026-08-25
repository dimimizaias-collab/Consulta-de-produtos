import { pgTable, text, integer, boolean, timestamp, uuid, numeric } from 'drizzle-orm/pg-core';

export const manufacturers = pgTable('manufacturers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  cnpj: text('cnpj'),
  prefix: text('prefix').notNull(), // 3 dígitos numéricos, zero-padded (ex: "007")
  active: boolean('active').default(true),
  nextSeq: integer('next_seq').default(1), // usar a RPC get_next_manufacturer_code() em vez de ler/escrever direto
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: text('sku'),
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
  brand: text('brand'), // legado — será substituído por manufacturerId (Fase 5)
  fabricante: text('fabricante'), // legado — idem
  cnpj: text('cnpj'), // legado — CNPJ passa a viver em manufacturers (Fase 5)
  composicao: text('composicao'),
  manufacturerId: uuid('manufacturer_id').references(() => manufacturers.id),
  linkedProductId: uuid('linked_product_id').references((): any => products.id),
  isMother: boolean('is_mother').default(false),
  unitsPerMother: integer('units_per_mother').default(1),
  minStock: integer('min_stock'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const salesImports = pgTable('sales_imports', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileName: text('file_name').notNull(),
  saleDate: text('sale_date').notNull(), // ISO date (YYYY-MM-DD) — dia da venda, informado pelo usuário no momento da importação
  rowCount: integer('row_count').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  unmatchedCount: integer('unmatched_count').notNull().default(0),
  status: text('status').notNull().default('applied'), // 'applied' (hoje só há aplicação direta após revisão)
  employeeId: uuid('employee_id').references(() => hrEmployees.id),
  employeeName: text('employee_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const salesImportItems = pgTable('sales_import_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  importId: uuid('import_id').references(() => salesImports.id).notNull(),
  productId: uuid('product_id').references(() => products.id), // null quando a linha não foi identificada
  rawSku: text('raw_sku'),
  rawEan: text('raw_ean'),
  rawDescription: text('raw_description'),
  quantitySold: integer('quantity_sold').notNull(),
  matched: boolean('matched').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  previousCount: integer('previous_count').notNull(),
  newCount: integer('new_count').notNull(),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(), // 'contagem_fisica' | 'avaria' | 'perda' | 'correcao_importacao' | 'outro' | 'venda_diaria'
  note: text('note'),
  source: text('source').notNull().default('manual'), // 'manual' | 'sales_import'
  salesImportId: uuid('sales_import_id').references(() => salesImports.id),
  employeeId: uuid('employee_id').references(() => hrEmployees.id),
  employeeName: text('employee_name'), // snapshot do nome no momento do ajuste
  createdAt: timestamp('created_at').defaultNow(),
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

export const hrEvents = pgTable('hr_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  data: text('data').notNull(), // ISO date (YYYY-MM-DD)
  titulo: text('titulo').notNull(),
  descricao: text('descricao'),
  categoria: text('categoria').notNull().default('Outro'), // 'Reunião' | 'Treinamento' | 'Férias' | 'Aniversário' | 'Outro'
  responsavel: text('responsavel'),
  cor: text('cor').notNull().default('#4F46E5'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const hrEmployees = pgTable('hr_employees', {
  id: uuid('id').defaultRandom().primaryKey(),
  nome: text('nome').notNull(),
  idade: integer('idade'),
  cargo: text('cargo').notNull().default(''),
  loja: text('loja').notNull().default(''),
  dataAdmissao: text('data_admissao').notNull(), // ISO date (YYYY-MM-DD)
  salario: numeric('salario', { precision: 12, scale: 2 }).default('0'),
  fotoUrl: text('foto_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usuarios = pgTable('usuarios', {
  id: uuid('id').defaultRandom().primaryKey(),
  authUserId: uuid('auth_user_id').notNull().unique(), // referencia auth.users.id (fora do schema Drizzle)
  employeeId: uuid('employee_id').references(() => hrEmployees.id).notNull().unique(),
  email: text('email').notNull().unique(), // espelha auth.users.email
  role: text('role').notNull().default('admin'), // 'admin' | 'gerente' | 'estoque' | 'caixa'
  ativo: boolean('ativo').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ─── Estoque físico ───────────────────────────────────────────────────────────

export const shelves = pgTable('shelves', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const storageBoxes = pgTable('storage_boxes', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  shelfId: uuid('shelf_id').references(() => shelves.id),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const boxContents = pgTable('box_contents', {
  id: uuid('id').defaultRandom().primaryKey(),
  boxId: uuid('box_id').references(() => storageBoxes.id).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
