import Game from './game';
import Match from './match';
import Person from './person';

export interface TournamentParticipant extends Omit<Person, 'id' | 'alias'> {
  serviceName: string;
  serviceId: string;
}

export interface TournamentEntrant {
  name: string;
  participants: TournamentParticipant[];
  inLosers?: boolean;
}
export const nullEntrant: Readonly<TournamentEntrant> = {
  name: '',
  participants: [],
};

export default interface TournamentSet {
  serviceInfo: {
    serviceName: string;
    id: string;
    phaseId: string;
    phaseGroupId: string;
  };
  match: Match | null;
  videogame: Game | null;
  shortIdentifier: string;
  displayName: string;
  completedAt: number | null;
  entrants: TournamentEntrant[];
}

export const nullSet: TournamentSet = Object.freeze({
  serviceInfo: {
    serviceName: '',
    id: '',
    phaseId: '',
    phaseGroupId: '',
  },
  match: null,
  videogame: null,
  shortIdentifier: '',
  displayName: '',
  completedAt: null,
  entrants: [],
});

// TODO: Can we rely on the assumption that serviceName + id is a unique
// identifier?
export function getTournamentSetIdString(s: TournamentSet): string {
  return `${s.serviceInfo.serviceName}_${s.serviceInfo.id}`;
}
