// Extract only actual PDF text; page labels cannot make an empty scan look readable.
export async function extractPdfPreview(pdf, maxChars=6000, maxPages=15) {
  let text='', actualText='', pagesRead=0, truncated=false;
  try {
    for(let n=1;n<=Math.min(pdf.numPages,maxPages);n++) {
      const page=await pdf.getPage(n), content=await page.getTextContent();
      const body=content.items.map(x=>typeof x.str==='string'?x.str:'').join(' ').trim();
      pagesRead=n;actualText+=body;
      if(body){const part=`[Página ${n}]\n${body}\n`;if(text.length+part.length>maxChars)truncated=true;text+=part;}
      if(text.length>=maxChars)break;
    }
    if(!actualText.trim())throw Error('PDF sem texto extraível. PDFs escaneados precisam de OCR, ainda não disponível.');
    return {text:text.slice(0,maxChars),pagesRead,totalPages:pdf.numPages,truncated:truncated||pagesRead<pdf.numPages};
  } finally {await pdf.destroy();}
}
