import {cards,recurring,debtPlans,projectTransaction,monthlyEquivalent,compareExtraPayment} from '../src';
const classic=cards.find(c=>c.id==='banamex-classic')!;
console.log('Compra 13/oct Clásica',projectTransaction({id:'x',cardId:classic.id,date:'2026-10-13',description:'Ejemplo',amount:1200,kind:'purchase',financing:'regular'},classic));
console.log('MSI 6 meses',projectTransaction({id:'y',cardId:classic.id,date:'2026-10-13',description:'Ejemplo MSI',amount:3000,kind:'purchase',financing:'msi',installments:6},classic));
console.log('Fijos mensuales netos',recurring.reduce((s,e)=>s+monthlyEquivalent(e),0).toFixed(2));
console.log('BBVA extra 10500',compareExtraPayment(debtPlans[0],10500));
