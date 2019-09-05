export default interface Game {
  id: string;
  name: string;
  shortNames: string[];
  hashtags: string[];
  serviceInfo: {
    twitch?: {
      id: string;
    };
  };
};

export const nullGame: Game = {
  id: '',
  name: '',
  shortNames: [],
  hashtags: [],
  serviceInfo: {},
};
