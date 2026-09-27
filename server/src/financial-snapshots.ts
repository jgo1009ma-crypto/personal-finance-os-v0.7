export type DataQuality = 'official'|'derived'|'estimated'|'inconsistent';

export interface CardSnapshot {
  cardId:string;
  statementDate:string;
  totalBalance:number;
  regularBalance?:number;
  installmentBalance?:number;
  paymentToAvoidInterest?:number;
  availableCredit?:number;
  dataQuality:DataQuality;
  note?:string;
}

export const cardSnapshots:CardSnapshot[]=[
  {
    cardId:'banamex-classic',statementDate:'2026-09-11',totalBalance:17163.57,
    regularBalance:14224.36,installmentBalance:2939.21,paymentToAvoidInterest:14224.36,
    availableCredit:0,dataQuality:'official'
  },
  {
    cardId:'banamex-joy',statementDate:'2026-09-17',totalBalance:37068.04,
    regularBalance:4244.60,installmentBalance:32823.44,paymentToAvoidInterest:4244.60,
    availableCredit:22432,dataQuality:'official'
  },
  {
    cardId:'bbva-blue',statementDate:'2026-09-12',totalBalance:47937.27,
    regularBalance:7363.12,installmentBalance:40574.15,paymentToAvoidInterest:7363.12,
    availableCredit:42662.73,dataQuality:'official'
  },
  {
    cardId:'nu',statementDate:'2026-09-05',totalBalance:11479.41,
    regularBalance:5342.45,installmentBalance:6136.96,paymentToAvoidInterest:5342.45,
    availableCredit:8386.23,dataQuality:'inconsistent',
    note:'El estado reporta subtotales y crédito disponible que no reconcilian entre sí; se conserva la suma de saldos regulares + meses como referencia operativa.'
  },
  {
    cardId:'liverpool',statementDate:'2026-08-27',totalBalance:19285.22,
    paymentToAvoidInterest:3646.16,availableCredit:25714.78,dataQuality:'estimated',
    note:'Saldo y pago para no generar intereses tomados del estado compartido; la disponibilidad se deriva del límite menos el saldo.'
  }
];
