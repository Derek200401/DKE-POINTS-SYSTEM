export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin"
  | "swiss";

export type TournamentStatus = "active" | "completed";
export type MatchState = "scheduled" | "in_progress" | "completed" | "disputed";
export type BestOf = 1 | 3 | 5;
export type StationStatus = "available" | "in_use" | "offline";
export type MatchBracket =
  | "main"
  | "winners"
  | "losers"
  | "finals"
  | "reset_final"
  | "placement"
  | "playoff";

export interface ParticipantStats {
  wins: number;
  losses: number;
}

export interface Participant {
  id: string;
  name: string;
  seed: number;
  rank: number;
  avatar: string | null;
  stats: ParticipantStats;
  groupId?: string;
}

export interface Station {
  id: string;
  name: string;
  status: StationStatus;
}

export interface MatchSource {
  matchId: string;
  result: "winner" | "loser";
}

export interface Match {
  id: string;
  stage: string;
  bracket: MatchBracket;
  groupId: string | null;
  groupName?: string;
  round: number;
  position: number;
  player1Id: string | null;
  player2Id: string | null;
  source1: MatchSource | null;
  source2: MatchSource | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  state: MatchState;
  isBye?: boolean;
  bestOf: BestOf;
  scheduledTime: string | null;
  stationId: string | null;
  startedAt?: string;
  completedAt?: string;
}

export interface TournamentGroup {
  id: string;
  name: string;
  participantIds: string[];
}

export interface AdminSettings {
  bestOf: BestOf;
  consolation: boolean;
  swissRounds: number;
  roundRobinRounds: number;
  poolPlayRounds: number;
  stations: Station[];
  grandFinalId: string | null;
  predictionsEnabled: boolean;
  poolPlay: boolean;
  groupCount: number;
  qualifiersPerGroup: number;
  groups?: TournamentGroup[];
  playoffGenerated: boolean;
}

export interface Tournament {
  id: string;
  title: string;
  format: TournamentFormat;
  status: TournamentStatus;
  seedingType: "rank" | "manual";
  currentStage: string;
  settings: AdminSettings;
  participants: Participant[];
  matches: Match[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTournamentInput {
  title: string;
  format: TournamentFormat;
  seedingType: "rank" | "manual";
  participants: string[];
  settings: Pick<AdminSettings, "bestOf" | "consolation"> & {
    stations?: string[];
    poolPlay?: boolean;
    groupCount?: number;
    qualifiersPerGroup?: number;
  };
}

export interface MatchResultInput {
  action: "result" | "force";
  matchId: string;
  score1?: number;
  score2?: number;
  winnerId?: string;
}

export interface MatchScheduleInput {
  action: "schedule";
  matchId: string;
  scheduledTime: string | null;
  stationId: string | null;
}
