import memoize from 'micro-memoize';

import { ApiKey } from '@models/challonge';
import Game from '@models/game';
import { getGameByChallongeId } from '@models/games';
import Match from '@models/match';
import { getMatchById, isGrandFinals, isTrueFinals } from '@models/matches';
import Tournament from '@models/tournament';
import TournamentEvent from '@models/tournament-event';
import TournamentPhase from '@models/tournament-phase';
import TournamentPhaseGroup from '@models/tournament-phase-group';
import TournamentSet from '@models/tournament-set';
import BracketService from '@services/bracket-service';
import { checkResponseStatus, checkServerError } from '@util/ajax';
import { getCredentials } from '@util/credentials';
import { nonNull } from '@util/predicates';

import { BASE_URL, TOURNAMENT_URL_REGEX } from './constants';
import { ApiTournament, ApiMatch, ApiParticipant } from './types';

export default class ChallongeClient implements BracketService {
  private readonly apiKey: ApiKey;
  private readonly memoizedGetPlayer: ChallongeClient['getPlayer'];
  private readonly memoizedGetGame: ChallongeClient['getGame'];

  public constructor() {
    const token = getCredentials().challongeApiKey;
    if (!token) {
      throw new Error('No Challonge API key');
    }
    this.apiKey = token;
    this.memoizedGetPlayer = memoize(
      this.getPlayer.bind(this),
      {
        maxSize: 128, // Enough to hold one pool
        isPromise: true,
      },
    );
    this.memoizedGetGame = memoize(
      this.getGame.bind(this),
      { isPromise: true },
    );
  }

  public async upcomingSetsByPhase(tournamentId: string): Promise<TournamentSet[]> {
    const url = `${BASE_URL}/tournaments/${tournamentId}/matches.json?api_key=${this.apiKey}`;
    const resp = await fetch(url)
      .then(checkResponseStatus)
      .then(resp => resp.json() as Promise<ApiMatch[]>);
    const getEntrant = async (
      playerId: number | null,
      inLosers: boolean,
    ): Promise<TournamentSet['entrants'][0] | null> => {
      if (playerId == null) {
        return null;
      }
      const p = await this.memoizedGetPlayer(tournamentId, playerId.toString());
      if (!p) {
        return null;
      }
      return {
        name: p.name,
        participants: [{
          smashggId: p.id,
          handle: p.name,
          prefix: null, // TODO: split on pipe?
          twitter: null,
        }],
        inLosers: inLosers,
      };
    };
    const videogame = await this.memoizedGetGame(tournamentId);
    const matchIdToMatch = getDomainMatches(resp);
    return Promise.all(resp
      .map(m =>  m.match)
      .map(async m => {
        const shortIdentifier = m.suggested_play_order ?
          m.suggested_play_order.toString() :
          m.identifier;
        const match = matchIdToMatch.get(m.id);
        const matchName = match ? match.id : m.round;
        const entrants = [
          await getEntrant(m.player1_id, isTrueFinals(match)),
          await getEntrant(m.player2_id, isTrueFinals(match) || isGrandFinals(match)),
        ];
        return ({
          id: m.id.toString(),
          phaseId: m.tournament_id.toString(),
          match: match || null,
          videogame,
          shortIdentifier,
          displayName: `${shortIdentifier} - ${matchName}: ${
            entrants
              .map(e => e ? e.name : '???')
              .join(' vs ')
          }`,
          entrants: entrants.filter(nonNull),
        });
      })
    );
  }

  public async eventIdForPhase(tournamentId: string): Promise<string> {
    // The Challonge API doesn't support multi-stage tournaments yet
    return tournamentId;
  }

  public async phasesForTournament(
    tournamentId: string,
  ): Promise<{
      tournament: Tournament;
      events: TournamentEvent[];
      phases: TournamentPhase[];
      phaseGroups: TournamentPhaseGroup[];
    }> {
    const url = `${BASE_URL}/tournaments/${tournamentId}.json?api_key=${this.apiKey}`;
    const resp = await fetch(url)
      .then(checkResponseStatus)
      .then(resp => resp.json() as Promise<ApiTournament>);
    const t = resp.tournament;
    const tournament = {
      id: t.id.toString(),
      name: t.name,
      url: t.full_challonge_url,
    };
    return {
      tournament,
      events: [ tournament ],
      phases: [{
        ...tournament,
        name: "Bracket",
        eventId: tournament.id,
      }],
      phaseGroups: [{
        ...tournament,
        name: "Bracket",
        eventId: tournament.id,
        phaseId: tournament.id,
      }],
    };
  }

  // NOTE: Apparently Challonge has no problem with giving us participant IDs
  // that lead straight to a 404
  private async getPlayer(tournamentId: string, participantId: string): Promise<{
    id: string;
    name: string;
  } | null> {
    const url = `${BASE_URL}/tournaments/${tournamentId}` +
      `/participants/${participantId}.json?api_key=${this.apiKey}`;
    const resp = await fetch(url)
      .then(checkServerError)
      .then(resp => resp.ok ? resp.json() as Promise<ApiParticipant> : null);
    if (!resp) {
      return null;
    }
    const p = resp.participant;
    return { id: p.id.toString(), name: p.display_name };
  }

  private async getGame(tournamentId: string): Promise<Game | null> {
    const url = `${BASE_URL}/tournaments/${tournamentId}.json?api_key=${this.apiKey}`;
    const resp = await fetch(url)
      .then(checkResponseStatus)
      .then(resp => resp.json() as Promise<ApiTournament>);
    const t = resp.tournament;
    return getGameByChallongeId(t.game_id.toString());
  }
}

function getDomainMatches(resp: ApiMatch[]): Map<number, Match | null> {
  const matches = resp.map(m => m.match);
  const byId = new Map(matches.map(m => [m.id, m]));
  const getById = byId.get.bind(byId);
  const matchIdToMatch = new Map(matches.map(m => [
    m.id,
    getMatchById(m.round > 0 ? `w${m.round}` : `l${m.round * -1}`),
  ]));
  const getPrereqs = (matchIds: number[]): number[] => matchIds
    .map(getById)
    .filter(nonNull)
    .flatMap(m => [ m.player1_prereq_match_id, m.player2_prereq_match_id ])
    .filter(nonNull);
  const getLosersPrereqs = (matchIds: number[]): number[] => matchIds
    .map(getById)
    .filter(nonNull)
    .flatMap(m => [ m.player2_prereq_match_id ])
    .filter(nonNull);
  const setAll = (matchIds: number[], match: Match | null): void => {
    if (!match) {
      return;
    }
    matchIds.forEach(id => matchIdToMatch.set(id, match));
  };
  for (const m of matches) {
    if (isApiTrueFinals(m)) {
      matchIdToMatch.set(m.id, getMatchById('tf'));
    } else if (isApiGrandFinals(byId, m)) {
      const wf = [ m.player1_prereq_match_id as number ];
      const ws = getPrereqs(wf);
      const wq = getPrereqs(ws);
      const lf = [ m.player2_prereq_match_id as number ];
      const ls = getLosersPrereqs(lf);
      const lq = getPrereqs(ls);
      matchIdToMatch.set(m.id, getMatchById('gf'));
      setAll(wf, getMatchById('wf'));
      setAll(ws, getMatchById('ws'));
      setAll(wq, getMatchById('wq'));
      setAll(lf, getMatchById('lf'));
      setAll(ls, getMatchById('ls'));
      setAll(lq, getMatchById('lq'));
    }
  }
  return matchIdToMatch;
}

function isApiGrandFinals(byId: Map<number, ApiMatch['match']>, match: ApiMatch['match']): boolean {
  const prereq1 = match.player1_prereq_match_id;
  const prereq2 = match.player2_prereq_match_id;
  if (prereq1 == null || prereq2 == null) {
    return false;
  }
  const m1 = byId.get(prereq1);
  const m2 = byId.get(prereq2);
  if (m1 == null || m2 == null) {
    return false;
  }
  return (m1.round > 0) != (m2.round > 0) &&
    match.player1_is_prereq_match_loser === false &&
    match.player2_is_prereq_match_loser === false;
}

function isApiTrueFinals(match: ApiMatch['match']): boolean {
  const prereq1 = match.player1_prereq_match_id;
  const prereq2 = match.player2_prereq_match_id;
  if (prereq1 == null || prereq2 == null) {
    return false;
  }
  return prereq1 === prereq2;
}

export function parseTournamentId(url: string): string | null {
  const match = TOURNAMENT_URL_REGEX.exec(url);
  if (!match) {
    return null;
  }
  const subdomain = match[1];
  const identifier = match[2];
  if (subdomain && subdomain != 'www' && subdomain != 'images') {
    return `${subdomain}-${identifier}`;
  }
  return identifier;
}
