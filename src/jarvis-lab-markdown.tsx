import {Fragment,type ReactNode} from 'react';

/**
 * Small read-only formatter for Gemini text. We do NOT interpret HTML,
 * user-supplied markup, script URLs or arbitrary links. React escapes text.
 */
export function labInlineText(text:string):ReactNode[]{
 return text.split(/(\*\*[^*\n]+\*\*)/g).filter(Boolean).map((piece,i)=>
  piece.startsWith('**')&&piece.endsWith('**')&&piece.length>4
   ?<strong key={i}>{piece.slice(2,-2)}</strong>
   :<Fragment key={i}>{piece}</Fragment>
 );
}
type Line={kind:'blank'|'bullet'|'number'|'heading'|'text';body:string};
export function labMarkdownLine(line:string):Line{
 const trimmed=line.trim();
 if(!trimmed)return {kind:'blank',body:''};
 const heading=trimmed.match(/^#{1,3}\s+(.+)$/);
 if(heading)return {kind:'heading',body:heading[1]};
 const bullet=trimmed.match(/^[-*]\s+(.+)$/);
 if(bullet)return {kind:'bullet',body:bullet[1]};
 const numbered=trimmed.match(/^\d{1,3}[.)]\s+(.+)$/);
 if(numbered)return {kind:'number',body:numbered[1]};
 return {kind:'text',body:trimmed};
}
export function LabFormattedText({text}:{text:string}){
 const lines=text.replace(/\r\n?/g,'\n').split('\n').map(labMarkdownLine);
 const blocks:ReactNode[]=[];
 let i=0;
 while(i<lines.length){
  const current=lines[i];
  if(current.kind==='blank'){i++;continue;}
  if(current.kind==='bullet'||current.kind==='number'){
   const kind=current.kind;
   const items:ReactNode[]=[];
   while(i<lines.length&&lines[i].kind===kind){
    items.push(<li key={i}>{labInlineText(lines[i].body)}</li>);
    i++;
   }
   blocks.push(kind==='bullet'?<ul key={blocks.length}>{items}</ul>:<ol key={blocks.length}>{items}</ol>);
   continue;
  }
  if(current.kind==='heading'){
   blocks.push(<p className="lab-markdown-heading" key={blocks.length}>{labInlineText(current.body)}</p>);
   i++;continue;
  }
  const paragraphs:string[]=[];
  while(i<lines.length&&lines[i].kind==='text'){
   paragraphs.push(lines[i].body);
   i++;
  }
  blocks.push(<p key={blocks.length}>{labInlineText(paragraphs.join(' '))}</p>);
 }
 return <div className="lab-markdown">{blocks}</div>;
}
