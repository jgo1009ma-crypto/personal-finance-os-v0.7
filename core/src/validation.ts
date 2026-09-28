/** Runtime validation is required at HTTP and tool boundaries; TS types alone do not validate JSON. */
export function validDate(value:unknown, field='date'):asserts value is string {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error(`${field} must be YYYY-MM-DD`);
  const d=new Date(value+'T00:00:00Z');
  if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error(`${field} must be a valid calendar date`);
}
export function validMonth(value:unknown,field='month'):asserts value is string {
  if(typeof value!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))throw new Error(`${field} must be YYYY-MM`);
}
export function finiteNumber(value:unknown,field:string,min=0,max=Number.MAX_SAFE_INTEGER/100):asserts value is number {
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${field} must be a finite number between ${min} and ${max}`);
}
export function integer(value:unknown,field:string,min:number,max:number):asserts value is number {
  finiteNumber(value,field,min,max);
  if(!Number.isInteger(value))throw new Error(`${field} must be an integer`);
}
