export type Id = string;

export type Timestamp = string;

export interface ApiMatchSlot {
  seedNumber: number;
  winner: boolean;
  disqualified: boolean;
  teamID: Id;
  team: {
    _id: Id;
    name: string;
    tournamentID: Id;
    ownerID: Id;
    createdAt: Timestamp;
    playerIDs: Id[];
  };
}

export interface ApiEmptySlot {
  winner: boolean;
  disqualified: boolean;
  teamID: undefined;
}

export interface ApiMatch {
  _id: Id;
  top: ApiMatchSlot | ApiEmptySlot;
  bottom: ApiMatchSlot | ApiEmptySlot;
  matchType: 'winner'|'loser';
  matchNumber: number;
  roundNumber: number;
  isBye: boolean;
  next?: {
    winner: {
      position: 'top'|'bottom';
      matchID: Id;
    };
    loser: {
      position: 'top'|'bottom';
      matchID: Id;
    };
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  doubleLoss: boolean;
  stageID: Id;
  isComplete?: boolean;
  inConsolationBracket?: boolean;
}

export type MatchResponse = ApiMatch[];

export interface ApiTournament {
  _id: Id;
  startTime: Timestamp;
  rules: {
    complete: string;
    critical: string;
  };
  playersPerTeam: number;
  customFields: unknown[];
  userCanReport: boolean;
  name: string;
  contact: {
    type: string;
    details:string;
  };
  type: string;
  isPublished: boolean;
  hasPassword: boolean;
  hasMaxPlayers: boolean;
  serviceFeePercent: number;
  about: string;
  schedule: string;
  prizes: string;
  checkInRequired: boolean;
  gameName: string;
  isFeatured: boolean;
  isPublic: boolean;
  isSuspended: boolean;
  isRosterLocked: boolean;
  registrationEnabled: boolean;
  emailsSent: {
    oneDay: boolean;
    now: boolean;
    pendingTeamNotification: boolean;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
  checkInStarts: string;
  checkInStartTime: Timestamp;
  slug: string;
  organizationID: Id;
  gameID: Id;
  stageIDs: Id[];
  streamIDs: unknown[];
  cloudSearchDocumentHash: boolean;
  cloudSearchDocumentLastGenerated: Timestamp;
  lastCompletedMatchAt: Timestamp;
  organization: {
    _id: Id;
    slug: string;
  };
  stages: {
    _id: Id;
    name: string;
  }[];
}

export type TournamentResponse = ApiTournament[];
