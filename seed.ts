import { db } from './db';
import { products } from './db/schema';

const initialProducts = [
  {
    sku: 'BM-500-A4',
    name: 'Batedeira Prática Master',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDy9IzS9YoiFtTcIxo3YamGb48ZJhxVqaVAFaU2tTOvd9BWDdG4vvynCRsOgQwMaOl7FRkfFF3XPBC1oxj3NPXEy9xvVwvgO8J2wvY0h35M_QoxHeF_ls8T6EcncLyx8v-nHk-yjbTUdpwX0rauSECHCaSr5G_-tsAOel0BV9Gc7dIoDgIQzFtECO44S4y3w28Sy-eYqjjXGMzJIgl9Olthg4-EGeiJKvbVhP5cP3Nne6Aes_seTIdjGOtTQbGuPq_b7GKKx3E97LY',
    status: 'Estoque em Alta',
    count: 18,
    location: 'Corredor A, Prateleira 4',
    isFeatured: true,
    ean: '7891234567890',
    internalCode: 'BM-500-A4',
    category: 'Utilidades Domésticas',
    subcategory: 'Eletrodomésticos'
  },
  {
    sku: 'SM-100-B1',
    name: 'Batedeira Industrial',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCgQ2S2TQbqqAW9AE6GVtOkzBYvO--JFEWI7ubEFQmT65aLnEMPoS0mmAW7hjR3VH9I6Ijpf2SWv2D4koP0FP36CLBxbYfwyjDUHFi6acDeC8JJhjSD1KmncX4kBcIiQuvNuViK9HmNdOWHFuXiuIkwsD9OnrDFX5Sk-KGne5rv6FXdkGaANiQGFlNV3srCfHA8bikGNckv7Rv6lTr_Kegtds2REp379OzyvTI8AA6qKf1cci4ritkIbpv6Kfo0zq74edEee7FsgWw',
    status: 'UTENSÍLIOS',
    count: 124,
    location: 'Corredor B, Prateleira 1',
    isSide: true,
    ean: '7899988776655',
    internalCode: 'ISM-100-B1',
    category: 'Industrial',
    subcategory: 'Batedeiras'
  },
  {
    sku: 'UT-991',
    name: "Conjunto de Ferramentas do Chef (12pc)",
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA1OK90XEjrOLxaNIHe41fRXdYk-noeOyCBxsgwSg5kJj8OB7DMehjaX2PCQktNN-HGBKnbkg9bbv7epyouqfkABzLnh0AMwnR8JNyVEeHmPlMMyta0pq0OQMRUosZtqG6B4Rg741hByyH7vbKrKhPdgZ7tPKSUqgc1LbvXV4xO16nfC31zL5b_RIibORtjyxnbHXLAiqUfZsUBWBL43t8SH3lGYpX7fgOBsJuTY46APiXS6boa40LxSplTBNujM8aAce2Bi7meUDw',
    status: 'Saudável',
    count: 342,
    location: 'Corredor C-2',
    ean: '7891112223334',
    internalCode: 'CT-12-C2',
    category: 'Utensílios de Cozinha',
    subcategory: 'Utensílios'
  },
  {
    sku: 'KT-404',
    name: 'Chaleira Inteligente de Vidro',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDO9L9VtiCAZJNi6lU8-r_EJED7LiO_yotTJE_NBq70qA_DvYYByRt9-y1WVh8KEIqUlguqiAkoWvDyHcbtpSSbHDW0sKLXoouy1eRcS9S_dgwEolsnQBebjZYxqNPme8-71lR18M0Ef5DZToezFVjh7w_86_T5hfaegKmbXiGWgK0YVfiRfEGHTYz1cYEi-iOjjwLCDljBYRjwXBJXnV_95daUoW_G253-wm6BU9mcBYNgyNxMg64wXpfRU981hg_ecl2o8nXblWg',
    status: 'Baixo',
    count: 5,
    location: 'Corredor A-9',
    isLow: true,
    ean: '7892223334445',
    internalCode: 'GSK-404-A9',
    category: 'Utilidades Domésticas',
    subcategory: 'Chaleiras'
  },
  {
    sku: 'PN-102',
    name: 'Conjunto de Panelas de Aço Inox',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCIAoh56NbZyIP5pcp1eS-BnJpeZts6717SSgHosVHKXuzkz9O6MxJ9V1ueTYjkYjCxTtoShI8SPxqX8YKMUK3DNvrafSSjG-eEaIxdS90Ewex6FkDz2-Wk8Qem4G250Z1e5cB-WFptWOo0y7DwZBMf4ONUo5gdWcS1Wm47PznA75O8o6YrvPiOb5PAvg2Vbv96g34PWf_ljAp2zca9blYeXvK2Ef4P5aByC5O8ZVqjbVCg8N_p1Te9H7PgD8tbtPUWKT_3rHk6yac',
    status: 'Saudável',
    count: 89,
    location: 'Corredor B-4',
    ean: '7893334445556',
    internalCode: 'SSP-102-B4',
    category: 'Utensílios de Cozinha',
    subcategory: 'Panelas'
  },
  {
    sku: 'TS-303',
    name: 'Torradeira Digital de 4 Fatias',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAD1L53ubGqBhCZAH9Z4J5jWTImvjwgoef4vX7VZ2CBA0p0AzQAyWAcKaLznzwSEGx7v-UrlKWLGUc7DxWXWjQ-X5i_qBLgdgnlfer_yE-ZeRhDlrc_9qAEtW-sEWVvBjXPGItMVc6pYoIfa8cST5eA6yuXGq7cbMJVE0e-lbrpPNAW1c4hmxbWaUVgJO3TE-j4dTige-Stda27i4hQGp2WDneeaQgQe1sewFwBCIJ2W08JToxrmmc85nf1UT1bUnARlcgYSRQUp7o',
    status: 'Saudável',
    count: 21,
    location: 'Corredor A-1',
    ean: '7894445556667',
    internalCode: 'DST-303-A1',
    category: 'Utilidades Domésticas',
    subcategory: 'Torradeiras'
  }
];

async function seed() {
  console.log('Seeding database...');
  for (const product of initialProducts) {
    await db.insert(products).values(product).onConflictDoUpdate({
      target: products.sku,
      set: product,
    });
  }
  console.log('Seeding complete!');
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
