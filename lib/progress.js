// Parse actual sampler progress, including carriage-return tqdm output.
export function samplingPercent(log,expectedSteps){
 const text=String(log).replace(/\x1b\[[0-9;]*m/g,'');let percent=null;
 for(const match of text.matchAll(/(?:\bStep\s+(\d+)\s*\/\s*(\d+))|(?:\b(\d{1,3})%\s*\|[^\r\n]*?\|\s*(\d+)\s*\/\s*(\d+))/gi)){
  const total=Number(match[2]??match[5]);if(expectedSteps!==undefined&&total!==expectedSteps)continue;
  const value=match[1]!==undefined?(Number(match[2])>0?100*Number(match[1])/Number(match[2]):NaN):Number(match[3]);
  if(Number.isFinite(value)&&value>=0&&value<=100)percent=Math.floor(value);
 }
 return percent;
}
