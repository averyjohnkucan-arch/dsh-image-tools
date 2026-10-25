// Parse actual sampler progress, including carriage-return tqdm output.
export function samplingPercent(log,expectedSteps){
 const text=String(log).replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');let percent=null;
 for(const match of text.matchAll(/(?:\bStep\s+(\d+)\s*\/\s*(\d+))|(?:\b(\d{1,3})%\s*\|[^\r\n]*?\|\s*(\d+)\s*\/\s*(\d+))|(?:\|[=> ]+\|\s*(\d+)\s*\/\s*(\d+)\s*-\s*[\d.]+(?:s\/it|it\/s))/gi)){
  const total=Number(match[2]??match[5]??match[7]);if(expectedSteps!==undefined&&total!==expectedSteps)continue;
  const value=match[1]!==undefined?(Number(match[2])>0?100*Number(match[1])/Number(match[2]):NaN):match[6]!==undefined?(total>0?100*Number(match[6])/total:NaN):Number(match[3]);
  if(Number.isFinite(value)&&value>=0&&value<=100)percent=Math.floor(value);
 }
 return percent;
}

// Sampling is only part of the job; reserve the end for decoding and model restoration.
export function progressSnapshot(job){
 if(!job)return null;
 const terminal=['complete','failed','cancelled'].includes(job.status);
 let stage=job.stage||(job.status==='queued'?'queued':'loading');
 let percent=Number.isFinite(job.percent)?Math.floor(5+.85*job.percent):null;
 if(stage==='decoding')percent=92;
 if(stage==='restoring')percent=96;
 if(stage==='saving')percent=99;
 if(job.status==='complete'){stage='complete';percent=100;}
 if(terminal&&job.status!=='complete')stage=job.status;
 return {status:job.status,stage,percent};
}
