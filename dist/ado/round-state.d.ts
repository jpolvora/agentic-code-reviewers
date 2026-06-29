import { AdoClient } from './client.js';
import type { AdoThreadsResponse, CodeReviewItem } from './types.js';
/** Marcador HTML da thread (geral) que persiste o contador de rodadas de review. */
export declare const ROUND_STATE_MARKER = "<!-- reviewer-round-state -->";
export interface RoundStateLocation {
    /** Número de rodadas já registradas (0 se ainda não houver estado). */
    round: number;
    /** Thread geral que carrega o marcador (null se inexistente). */
    threadId: string | number | null;
    /** Comentário do bot dentro da thread (null se inexistente). */
    commentId: string | number | null;
}
export interface RoundDecisionInput {
    /** Rodada atual (rodadas anteriores + 1). */
    currentRound: number;
    /** Orçamento de rodadas; 0 desabilita o escalonamento. */
    maxRounds: number;
    /** Há reviews novos a publicar ou threads pendentes do bot? */
    hasOpenIssues: boolean;
}
/**
 * Lê o estado de rodada persistido numa thread geral (sem `filePath`) do bot.
 *
 * O estado é append-free: uma única thread cujo comentário do bot contém
 * `Rodada: N`. Retorna `round = 0` quando ainda não existe.
 */
export declare function parseRoundStateFromThreads(threads: AdoThreadsResponse | null, botTag: string): RoundStateLocation;
/**
 * Decide o escalonamento para revisão humana: quando a rodada atual excede o
 * orçamento configurado E ainda há issues abertas (novas ou pendentes).
 */
export declare function decideRoundEscalation(input: RoundDecisionInput): boolean;
/**
 * Em escalonamento, mantém apenas achados `critical` (segurança/dados/regra
 * invariante não podem ser suprimidos) e separa os demais para o aviso de
 * handoff humano.
 */
export declare function splitReviewsForEscalation(reviews: CodeReviewItem[]): {
    kept: CodeReviewItem[];
    suppressed: CodeReviewItem[];
};
export interface RoundStateCommentInput {
    currentRound: number;
    maxRounds: number;
    escalate: boolean;
    suppressedCount: number;
}
/** Corpo do comentário de estado de rodada (e aviso de escalonamento). */
export declare function buildRoundStateComment(botTag: string, input: RoundStateCommentInput): string;
/**
 * Persiste/atualiza a thread de estado de rodada. PATCH no comentário quando já
 * existe (mantém uma única thread, sem spam); POST de nova thread caso contrário.
 */
export declare function persistRoundState(client: AdoClient, pullRequestId: number, botTag: string, input: RoundStateCommentInput, existing: RoundStateLocation, log: (msg: string) => void): Promise<void>;
//# sourceMappingURL=round-state.d.ts.map