import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const hash = p => bcrypt.hashSync(p, 12)
const daysAgo = n => new Date(Date.now() - n * 86400000)
const daysAhead = n => new Date(Date.now() + n * 86400000)
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a
const pick = arr => arr[rand(0,arr.length-1)]
let c=1000; const inv=(p='VTE')=>{const d=new Date();return `${p}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${++c}`}

async function main() {
  console.log('🌱 Seeding...\n')

  // SuperAdmin
  const sa = await prisma.superAdmins.upsert({
    where:{ email:'superadmin@pharmapulse.com' }, update:{},
    create:{ name:'Platform Admin', email:'superadmin@pharmapulse.com', password:hash('SuperAdmin2024!'), is_active:true },
  })
  console.log('✅ SuperAdmin: superadmin@pharmapulse.com / SuperAdmin2024!')

  // Categories
  const catNames = ['Analgésique','Antibiotique','Anti-inflammatoire','Antihypertenseur','Antidiabétique','Antihistaminique','Gastro-entérologie','Pédiatrie','Complément alimentaire','Dermatologie']
  const cats = {}
  for (const name of catNames) {
    const c = await prisma.category.upsert({ where:{name}, update:{}, create:{name} })
    cats[name] = c
  }
  console.log(`✅ ${catNames.length} categories`)

  // Pharmacy 1 — ACTIVE PRO
  const ph1 = await prisma.pharmacy.upsert({
    where:{ license_number:'LIC-2024-00001' }, update:{},
    create:{ name:'Pharmacie de la Paix', city:'Dakar', country:'Sénégal', email:'contact@pharmaciedelapaix.sn', phone:'+221 33 821 00 00', license_number:'LIC-2024-00001', status:'ACTIVE', is_active:true, max_users:10 },
  })
  const u1a = await prisma.users.upsert({ where:{email_pharmacyId:{email:'admin@pharma.com',pharmacyId:ph1.id}}, update:{}, create:{name:'Dr. Aminata Diallo',email:'admin@pharma.com',password:hash('Admin1234!'),role:'ADMIN',status:'ACTIVE',pharmacyId:ph1.id} })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'manager@pharma.com',pharmacyId:ph1.id}}, update:{}, create:{name:'Ibrahima Ndiaye',email:'manager@pharma.com',password:hash('Manager1234!'),role:'MANAGER',status:'ACTIVE',pharmacyId:ph1.id} })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'caissier@pharma.com',pharmacyId:ph1.id}}, update:{}, create:{name:'Fatou Sarr',email:'caissier@pharma.com',password:hash('Caissier1234!'),role:'CAISSIER',status:'ACTIVE',pharmacyId:ph1.id} })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'stock@pharma.com',pharmacyId:ph1.id}}, update:{}, create:{name:'Moussa Ba',email:'stock@pharma.com',password:hash('Stock1234!'),role:'STOCK_MANAGER',status:'ACTIVE',pharmacyId:ph1.id} })

  const sub1 = await prisma.subscriptions.upsert({ where:{pharmacyId:ph1.id}, update:{}, create:{ pharmacyId:ph1.id, plan:'PRO', status:'ACTIVE', start_date:daysAgo(30), end_date:daysAhead(335), amount:35000, currency:'XOF' } })
  try { await prisma.subscriptionPayments.create({ data:{ subscriptionId:sub1.id, amount:35000, method:'CASH', reference:'PAY-001', period_start:daysAgo(30), period_end:daysAhead(335) } }) } catch {}

  // Pharmacy 2 — ACTIVE STARTER
  const ph2 = await prisma.pharmacy.upsert({
    where:{ license_number:'LIC-2024-00002' }, update:{},
    create:{ name:'Pharmacie Centrale', city:'Thiès', country:'Sénégal', email:'contact@pharmaciecentrale.sn', phone:'+221 33 951 00 00', license_number:'LIC-2024-00002', status:'ACTIVE', is_active:true, max_users:5 },
  })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'admin@pharmacentrale.com',pharmacyId:ph2.id}}, update:{}, create:{name:'Dr. Ousmane Diop',email:'admin@pharmacentrale.com',password:hash('Admin1234!'),role:'ADMIN',status:'ACTIVE',pharmacyId:ph2.id} })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'caissier@pharmacentrale.com',pharmacyId:ph2.id}}, update:{}, create:{name:'Aïssatou Fall',email:'caissier@pharmacentrale.com',password:hash('Caissier1234!'),role:'CAISSIER',status:'ACTIVE',pharmacyId:ph2.id} })
  const sub2 = await prisma.subscriptions.upsert({ where:{pharmacyId:ph2.id}, update:{}, create:{ pharmacyId:ph2.id, plan:'STARTER', status:'ACTIVE', start_date:daysAgo(60), end_date:daysAhead(120), amount:15000, currency:'XOF' } })

  // Pharmacy 3 — SUSPENDED
  const ph3 = await prisma.pharmacy.upsert({
    where:{ license_number:'LIC-2024-00003' }, update:{},
    create:{ name:'Pharmacie du Progrès', city:'Saint-Louis', country:'Sénégal', license_number:'LIC-2024-00003', status:'SUSPENDED', is_active:false, suspended_at:daysAgo(45), suspended_reason:'Abonnement non renouvelé depuis 45 jours', max_users:5 },
  })
  await prisma.users.upsert({ where:{email_pharmacyId:{email:'admin@pharmaprogres.com',pharmacyId:ph3.id}}, update:{}, create:{name:'Dr. Rokhaya Gueye',email:'admin@pharmaprogres.com',password:hash('Admin1234!'),role:'ADMIN',status:'ACTIVE',pharmacyId:ph3.id} })
  await prisma.subscriptions.upsert({ where:{pharmacyId:ph3.id}, update:{}, create:{ pharmacyId:ph3.id, plan:'STARTER', status:'EXPIRED', start_date:daysAgo(180), end_date:daysAgo(45), amount:15000, currency:'XOF' } })

  console.log('✅ 3 pharmacies + subscriptions')

  // Products & sales for pharmacy 1
  const prods = [
    {name:'Paracetamol 500mg',cat:'Analgésique',sale:500,buy:250,stock:120,min:30,bc:'5900000000001'},
    {name:'Amoxicilline 500mg',cat:'Antibiotique',sale:2500,buy:1400,stock:45,min:20,bc:'5900000000002'},
    {name:'Ibuprofène 400mg',cat:'Anti-inflammatoire',sale:800,buy:400,stock:8,min:25,bc:'5900000000003'},
    {name:'Metformine 850mg',cat:'Antidiabétique',sale:1200,buy:600,stock:0,min:20,bc:'5900000000004'},
    {name:'Oméprazole 20mg',cat:'Gastro-entérologie',sale:900,buy:450,stock:62,min:15,bc:'5900000000005'},
    {name:'Doliprane 1000mg',cat:'Analgésique',sale:600,buy:300,stock:88,min:40,bc:'5900000000008'},
    {name:'Vitamine C 1000mg',cat:'Complément alimentaire',sale:1500,buy:800,stock:22,min:10,bc:'5900000000010'},
  ]
  const products = []
  for (const p of prods) {
    const ex = await prisma.products.findFirst({ where:{barcode:p.bc,pharmacyId:ph1.id} })
    const prod = ex ?? await prisma.products.create({ data:{name:p.name,barcode:p.bc,categoryId:cats[p.cat].id,pharmacyId:ph1.id,userId:u1a.id,sale_price:p.sale,purchase_price:p.buy,stock:p.stock,threshold:p.min,status:p.stock===0?'OUT_OF_STOCK':'AVAILABLE',unit_type:'BOX'} })
    products.push(prod)
  }
  console.log(`✅ ${products.length} products`)

  // 8 sales
  const avail = products.filter(p=>p.stock>3)
  for (let i=0;i<8;i++) {
    const items=avail.slice(i%avail.length,(i%avail.length)+1)
    let total=0
    const details=items.map(p=>{const qty=1,price=Number(p.sale_price),t=qty*price;total+=t;return{productId:p.id,quantity:qty,price,total:t,discount:0}})
    const sale=await prisma.sales.create({data:{pharmacyId:ph1.id,userId:u1a.id,invoice_number:inv('VTE'),customer:pick(['M. Diallo','Client comptoir']),payment_method:'CASH',total_amount:total,discount:0,tax:0,sale_date:daysAgo(rand(0,20)),details:{create:details}}})
    for(const d of details){
      const prod=await prisma.products.findUnique({where:{id:d.productId}})
      if(!prod||prod.stock<d.quantity)continue
      const ns=prod.stock-d.quantity
      await prisma.products.update({where:{id:d.productId},data:{stock:ns,status:ns===0?'OUT_OF_STOCK':'AVAILABLE'}})
      await prisma.stockMovements.create({data:{productId:d.productId,pharmacyId:ph1.id,userId:u1a.id,type:'SALE',quantity:-d.quantity,previous_stock:prod.stock,new_stock:ns,reference_id:sale.id,reason:`Vente ${sale.invoice_number}`}})
    }
  }
  console.log('✅ 8 sales')

  // Notifications
  await prisma.notifications.createMany({ skipDuplicates:true, data:[
    {pharmacyId:ph1.id,title:'✅ Bienvenue sur PharmaPulse',message:'Votre espace est prêt.',type:'SUCCESS'},
    {pharmacyId:ph3.id,title:'❌ Compte suspendu',message:'Abonnement expiré. Contactez le support.',type:'ERROR'},
  ]})

  console.log('\n'+'═'.repeat(55))
  console.log('🎉 Seed terminé!\n')
  console.log('🔐 SUPER ADMIN:')
  console.log('   superadmin@pharmapulse.com / SuperAdmin2024!\n')
  console.log('💊 Pharmacie 1 (Active - PRO):')
  console.log('   admin@pharma.com / Admin1234!')
  console.log('   manager@pharma.com / Manager1234!')
  console.log('   caissier@pharma.com / Caissier1234!\n')
  console.log('💊 Pharmacie 2 (Active - STARTER):')
  console.log('   admin@pharmacentrale.com / Admin1234!\n')
  console.log('❌ Pharmacie 3 (SUSPENDUE):')
  console.log('   admin@pharmaprogres.com / Admin1234!')
  console.log('═'.repeat(55))
}

main().catch(e=>{console.error('❌',e);process.exit(1)}).finally(()=>prisma.$disconnect())
