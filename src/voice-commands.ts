/** Only exact, deliberate user utterances confirm a visible proposal. Never parse model replies. */
export type VoiceCommand='external.prepare'|'external.confirm'|'external.cancel'|'task.create'|'task.complete'|'project.create'|'memory.save';
export function voiceCommand(text:string):VoiceCommand|null{
 const clean=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/^sigma[,\s]+/,'').replace(/[.!?]+$/,'').trim().replace(/\s+/g,' ');
 const commands:Record<string,VoiceCommand>={'preparar acao':'external.prepare','confirmar acao':'external.confirm','cancelar acao':'external.cancel','confirmar tarefa':'task.create','confirmar conclusao':'task.complete','confirmar projeto':'project.create','confirmar memoria':'memory.save'};
 return commands[clean]||null;
}
