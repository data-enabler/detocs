import { h, render } from 'preact';

import Game, { nullGame } from '../../models/game';

import { infoEndpoint } from './api';
import AutocompleteFields from './autocomplete-fields';

export default class GameFieldsElement extends HTMLElement {
  private connectedCallback(): void {
    render(<GameFields />, this);
  }
}

class GameFields extends AutocompleteFields<Game> {
  public constructor() {
    super('game', 'Game', nullGame);
    loadGameList().then(this.setOptions.bind(this));
  }
}

function loadGameList(): Promise<Game[]> {
  return fetch(infoEndpoint('/games').href)
    .catch(console.error)
    .then(resp => resp ? resp.json() as Promise<Game[]> : Promise.reject());
}