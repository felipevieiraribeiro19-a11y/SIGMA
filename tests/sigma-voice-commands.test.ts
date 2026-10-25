import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCommand} from '../src/voice-commands';
test('comandos de voz exigem frases inteiras e separam destino e operação',()=>{
 assert.equal(voiceCommand('Sigma, confirmar memória.'),'memory.save');
 assert.equal(voiceCommand('confirmar tarefa'),'task.create');
 assert.equal(voiceCommand('Confirmar conclusão!'),'task.complete');
 assert.equal(voiceCommand('preparar ação'),'external.prepare');
 assert.equal(voiceCommand('Confirmar ação.'),'external.confirm');
 assert.equal(voiceCommand('Cancelar ação'),'external.cancel');
 assert.equal(voiceCommand('confirmar projeto'),'project.create');
});
test('não executa confirmação citada, ambígua, negada ou embutida em conversa',()=>{
 for(const text of ['sim','pode','não confirmar tarefa','O documento diz confirmar ação','Como confirmar memória?','confirmar ação e apagar tudo','"confirmar tarefa"'])assert.equal(voiceCommand(text),null);
});
