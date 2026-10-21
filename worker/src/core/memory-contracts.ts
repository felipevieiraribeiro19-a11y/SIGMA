/** Contratos de dados futuros, sem gravação automática ou migração do Firestore. */
export type MemoryKind='conversation'|'fact'|'preference'|'document'|'structured-record'|'action-audit';
export type MemoryProvenance={sourceId:string;sourceKind:'conversation'|'user-confirmation'|'connector'|'system-action';observedAt:string};
export type MemoryRecord={
 id:string;ownerUid:string;kind:MemoryKind;schemaVersion:number;
 title?:string;createdAt:string;updatedAt:string;provenance:MemoryProvenance[];
 verification:'unverified'|'confirmed'|'rejected';retention:'until-deleted'|'ephemeral';
};
/** Um pedido para lembrar algo não significa que foi salvo. */
export type MemoryProposal={kind:'fact'|'preference'|'structured-record';value:unknown;source:MemoryProvenance;requiresUserReview:true};
export function proposeMemory(kind:MemoryProposal['kind'],value:unknown,source:MemoryProvenance):MemoryProposal{
 return {kind,value,source,requiresUserReview:true};
}
export function isPersistedMemory(value:MemoryProposal|MemoryRecord):value is MemoryRecord{
 return 'id' in value&&'verification' in value&&'ownerUid' in value;
}
