import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
import db, { pool } from '../config/database.js'
import {
  superAdmins, category, pharmacy, users, subscriptions, subscriptionPayments,
  products, sales, saleDetails, stockMovements, notifications,
} from './schema.js'

// Real mailbox: registration notifications and password-reset links are sent here
const SUPER_ADMIN_EMAIL = 'hamallahmanga@gmail.com'

const hash = p => bcrypt.hashSync(p, 12)
const daysAgo = n => new Date(Date.now() - n * 86400000)
const daysAhead = n => new Date(Date.now() + n * 86400000)
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a
const pick = arr => arr[rand(0,arr.length-1)]
let c=1000; const inv=(p='VTE')=>{const d=new Date();return `${p}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${++c}`}

/** Insert unless a row matching `where` already exists (equivalent of Prisma upsert with `update: {}`) */
async function upsert(table, where, values) {
  const [existing] = await db.select().from(table).where(where).limit(1)
  if (existing) return existing
  const [created] = await db.insert(table).values(values).returning()
  return created
}

const upsertUser = (pharmacyId, email, values) =>
  upsert(users, and(eq(users.email, email), eq(users.pharmacyId, pharmacyId)), { ...values, email, pharmacyId })

const upsertPayment = values =>
  upsert(subscriptionPayments, eq(subscriptionPayments.reference, values.reference), { currency:'MRU', ...values })

// Catalogue commun — prix en MRU
const CATALOG = [
  {name:'Paracétamol 500mg',     cat:'Analgésique',            sale:25,  buy:15, bc:'6210000000001'},
  {name:'Doliprane 1000mg',      cat:'Analgésique',            sale:45,  buy:25, bc:'6210000000002'},
  {name:'Amoxicilline 500mg',    cat:'Antibiotique',           sale:120, buy:70, bc:'6210000000003'},
  {name:'Azithromycine 250mg',   cat:'Antibiotique',           sale:180, buy:105,bc:'6210000000004'},
  {name:'Ibuprofène 400mg',      cat:'Anti-inflammatoire',     sale:40,  buy:22, bc:'6210000000005'},
  {name:'Amlodipine 5mg',        cat:'Antihypertenseur',       sale:95,  buy:55, bc:'6210000000006'},
  {name:'Metformine 850mg',      cat:'Antidiabétique',         sale:80,  buy:45, bc:'6210000000007'},
  {name:'Loratadine 10mg',       cat:'Antihistaminique',       sale:60,  buy:32, bc:'6210000000008'},
  {name:'Oméprazole 20mg',       cat:'Gastro-entérologie',     sale:60,  buy:35, bc:'6210000000009'},
  {name:'SRO sachets (réhydratation)', cat:'Pédiatrie',        sale:15,  buy:8,  bc:'6210000000010'},
  {name:'Vitamine C 1000mg',     cat:'Complément alimentaire', sale:90,  buy:50, bc:'6210000000011'},
  {name:'Crème hydratante karité', cat:'Dermatologie',         sale:150, buy:85, bc:'6210000000012'},
]

async function seedProducts(ph, userId, cats, stocks) {
  const rows = []
  for (const [i, p] of CATALOG.entries()) {
    const stock = stocks[i]
    if (stock === undefined) continue
    rows.push(await upsert(products, and(eq(products.barcode, p.bc), eq(products.pharmacyId, ph.id)), {
      name:p.name, barcode:p.bc, categoryId:cats[p.cat].id, pharmacyId:ph.id, userId,
      sale_price:p.sale, purchase_price:p.buy, stock, threshold:20,
      status: stock===0 ? 'OUT_OF_STOCK' : 'AVAILABLE', unit_type:'BOX',
    }))
  }
  return rows
}

async function main() {
  console.log('🌱 Seeding...\n')

  // SuperAdmin
  await upsert(superAdmins, eq(superAdmins.email, SUPER_ADMIN_EMAIL),
    { name:'Platform Admin', email:SUPER_ADMIN_EMAIL, password:hash('SuperAdmin2024!'), is_active:true })
  console.log(`✅ SuperAdmin: ${SUPER_ADMIN_EMAIL} / SuperAdmin2024!`)

  // Categories
  const catNames = ['Analgésique','Antibiotique','Anti-inflammatoire','Antihypertenseur','Antidiabétique','Antihistaminique','Gastro-entérologie','Pédiatrie','Complément alimentaire','Dermatologie']
  const cats = {}
  for (const name of catNames) {
    cats[name] = await upsert(category, eq(category.name, name), { name })
  }
  console.log(`✅ ${catNames.length} categories`)

  // ── Pharmacie 1 — Nouakchott (Tevragh Zeina) — ACTIVE 12 mois, garde ven + sam de nuit ──
  const ph1 = await upsert(pharmacy, eq(pharmacy.license_number, 'MR-NKC-2024-001'), {
    name:'Pharmacie Chifa', address:'Avenue Charles de Gaulle, Tevragh Zeina', city:'Nouakchott', country:'Mauritanie',
    email:'contact@pharmaciechifa.mr', phone:'+222 45 25 10 10', latitude:18.1036, longitude:-15.9785,
    license_number:'MR-NKC-2024-001', status:'ACTIVE', is_active:true, max_users:10,
    duty_days:[5,6], duty_start:'20:00', duty_end:'08:00',
  })
  const u1a = await upsertUser(ph1.id, 'admin@pharmaciechifa.mr', {name:'Dr. Mohamed Ould Ahmed',password:hash('Admin1234!'),role:'ADMIN',status:'ACTIVE'})
  await upsertUser(ph1.id, 'manager@pharmaciechifa.mr',  {name:'Mariem Mint Sidi',password:hash('Manager1234!'),role:'MANAGER',status:'ACTIVE'})
  await upsertUser(ph1.id, 'caissier@pharmaciechifa.mr', {name:'Sidi Mohamed Ould Cheikh',password:hash('Caissier1234!'),role:'CAISSIER',status:'ACTIVE'})
  await upsertUser(ph1.id, 'stock@pharmaciechifa.mr',    {name:'Aïcha Mint Brahim',password:hash('Stock1234!'),role:'STOCK_MANAGER',status:'ACTIVE'})
  const sub1 = await upsert(subscriptions, eq(subscriptions.pharmacyId, ph1.id),
    { pharmacyId:ph1.id, plan:'STARTER', status:'ACTIVE', start_date:daysAgo(30), end_date:daysAhead(330), amount:18000, currency:'MRU' })
  await upsertPayment({ subscriptionId:sub1.id, amount:18000, method:'CASH', reference:'PAY-MR-0001', period_start:daysAgo(30), period_end:daysAhead(330), notes:'Souscription 12 mois × 1500 MRU' })

  console.log('✅ 1 pharmacie + abonnement')

  // Produits (un stock par entrée du catalogue ; undefined = produit absent de la pharmacie)
  const prodRows1 = await seedProducts(ph1, u1a.id, cats, [120, 88, 45, 30, 8, 25, 0, 40, 62, 150, 22, 12])
  console.log(`✅ ${prodRows1.length} produits`)

  // 8 ventes pour la pharmacie 1 — premier lancement uniquement (sinon numéros de facture en double et stock décrémenté à nouveau)
  const [alreadySeeded] = await db.select({ id: sales.id }).from(sales).where(eq(sales.pharmacyId, ph1.id)).limit(1)
  const avail = alreadySeeded ? [] : prodRows1.filter(p=>p.stock>3)
  for (let i=0;i<(avail.length ? 8 : 0);i++) {
    const items=avail.slice(i%avail.length,(i%avail.length)+1)
    let total=0
    const details=items.map(p=>{const qty=rand(1,3),price=Number(p.sale_price),t=qty*price;total+=t;return{productId:p.id,quantity:qty,price,total:t,discount:0}})
    const [sale]=await db.insert(sales).values({pharmacyId:ph1.id,userId:u1a.id,invoice_number:inv('VTE'),customer:pick(['Client comptoir','M. Ould Salem','Mme Mint Ahmed','M. Ba']),payment_method:pick(['CASH','MOBILE_MONEY']),total_amount:total,discount:0,tax:0,sale_date:daysAgo(rand(0,20))}).returning()
    await db.insert(saleDetails).values(details.map(d=>({...d,saleId:sale.id})))
    for(const d of details){
      const [prod]=await db.select().from(products).where(eq(products.id,d.productId))
      if(!prod||prod.stock<d.quantity)continue
      const ns=prod.stock-d.quantity
      await db.update(products).set({stock:ns,status:ns===0?'OUT_OF_STOCK':'AVAILABLE'}).where(eq(products.id,d.productId))
      await db.insert(stockMovements).values({productId:d.productId,pharmacyId:ph1.id,userId:u1a.id,type:'SALE',quantity:-d.quantity,previous_stock:prod.stock,new_stock:ns,reference_id:sale.id,reason:`Vente ${sale.invoice_number}`})
    }
  }
  console.log(alreadySeeded ? '⏭️  Ventes déjà présentes, ignorées' : '✅ 8 ventes')

  // Notifications (premier lancement uniquement — pas de clé unique pour dédoublonner)
  if (!alreadySeeded) await db.insert(notifications).values([
    {pharmacyId:ph1.id,title:'✅ Bienvenue sur PharmaPulse',message:'Votre espace est prêt.',type:'SUCCESS'},
  ]).onConflictDoNothing()

  console.log('\n'+'═'.repeat(60))
  console.log('🎉 Seed terminé!\n')
  console.log('🔐 SUPER ADMIN:')
  console.log(`   ${SUPER_ADMIN_EMAIL} / SuperAdmin2024!\n`)
  console.log('💊 Pharmacie Chifa — Nouakchott (Active, 12 mois):')
  console.log('   admin@pharmaciechifa.mr / Admin1234!')
  console.log('   manager@pharmaciechifa.mr / Manager1234!')
  console.log('   caissier@pharmaciechifa.mr / Caissier1234!')
  console.log('   stock@pharmaciechifa.mr / Stock1234!')
  console.log('═'.repeat(60))
}

main().catch(e=>{console.error('❌',e);process.exit(1)}).finally(()=>pool.end())
