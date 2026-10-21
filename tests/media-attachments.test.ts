import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAttachment,HttpError} from '../worker/src/validation';

test('anexo PDF curto é aceito com base64 estrito',()=>{
 const file=validateAttachment({name:'aula.pdf',mimeType:'application/pdf',data:'JVBERi0x'});
 assert.deepEqual(file,{name:'aula.pdf',mimeType:'application/pdf',data:'JVBERi0x'});
});
test('não permite anexos de tipos desconhecidos ou HTML executável',()=>{
 assert.throws(()=>validateAttachment({name:'page.html',mimeType:'text/html',data:'PGh0bWw+'}),HttpError);
});
test('não permite dados inválidos ou anexos maiores que 3 MB',()=>{
 assert.throws(()=>validateAttachment({name:'aula.pdf',mimeType:'application/pdf',data:'!!invalid!!'}),HttpError);
 assert.throws(()=>validateAttachment({name:'aula.pdf',mimeType:'application/pdf',data:'A'.repeat(4194308)}),HttpError);
});
test('sem anexo mantém o chat de texto anterior',()=>{
 assert.equal(validateAttachment(undefined),undefined);
});
test('rejeita nomes com caracteres de controle',()=>{
 assert.throws(()=>validateAttachment({name:'ola\n.pdf',mimeType:'application/pdf',data:'JVBERi0x'}),HttpError);
});
