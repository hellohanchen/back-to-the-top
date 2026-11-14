export function labelIndices(values, start, end) {
 const indices=[];
 for(let i=start;i<=end;i++)if(Number.isFinite(values[i]))indices.push(i);
 if(end-start+1<=15)return new Set(indices);
 if(!indices.length)return new Set();
 let min=indices[0],max=min;
 for(const i of indices){if(values[i]<values[min])min=i;if(values[i]>values[max])max=i;}
 return new Set([min,max]);
}
