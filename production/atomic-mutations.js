// Mutate a draft, persist once, then publish it. Local write failures preserve the in-memory state.
async function commitDraft(data,write,mutate){
  const draft=structuredClone(data);mutate(draft);await write(draft);
  Object.assign(data,draft);
}
function applyImport(data,statement,transactions,snapshot){
  const index=data.imports.findIndex(i=>i.id===statement.id);
  if(index<0||data.imports[index].status!=='review')throw new Error('Import is already committed');
  data.transactions.push(...structuredClone(transactions));
  if(snapshot){const i=data.snapshots.findIndex(s=>s.cardId===snapshot.cardId);if(i<0)data.snapshots.push(structuredClone(snapshot));else data.snapshots[i]=structuredClone(snapshot);}
  data.imports[index]=structuredClone(statement);
}
function applyContribution(data,contribution){
  const goal=data.goals.find(g=>g.id===contribution.goalId);
  if(!goal||goal.status==='archived')throw new Error('Goal unavailable');
  const amount=Math.round((goal.currentAmount+contribution.amount)*100)/100;
  if(!Number.isSafeInteger(Math.round(amount*100)))throw new Error('Goal balance is too large');
  goal.currentAmount=amount;goal.updatedAt=contribution.createdAt;
  goal.status=amount>=goal.targetAmount?'completed':'active';
  data.goalContributions.push(structuredClone(contribution));
}
module.exports={commitDraft,applyImport,applyContribution};
