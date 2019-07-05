import { h, Component, ComponentChild, Ref } from 'preact';

import { RefObject } from '../../util/preact';

const idRegex = /\{\{(\w+)\}\}/;
let idCounter = 0;

function getPlaceholder(id: string): string {
  return `{{${id}}}`;
}

interface AutocompleteProps<T> {
  id: string;
  options: T[];
  inputRef: RefObject<HTMLInputElement>;
  idMapper: (entity: T) => string;
  nameMapper: (entity: T) => string;
  setValue: (entity: T) => void;
}

class Autocomplete<T> extends Component<AutocompleteProps<T>> {
  public static newId(): string {
    return `autocomplete-${idCounter++}`;
  }

  public static isAutocompleteValue(val: string): boolean {
    return idRegex.test(val);
  }

  public componentDidMount(): void {
    const input = this.props.inputRef.current;
    if (input) {
      input.addEventListener('input', this.handleInput.bind(this));
    }
  }

  private findValueInOptions(id: string): T | null {
    return this.props.options
      .find(t => this.props.idMapper(t) === id) ||
      null;
  }

  protected setValue(value: T): void {
    this.setState({ value });
  }

  protected setOptions(options: T[]): void {
    this.setState({ options });
  }

  private handleInput = (event: Event): void => {
    const name = (event.target as HTMLInputElement).value;
    const match = idRegex.exec(name);
    if (match) {
      const id = match[1];
      const entity = this.findValueInOptions(id);
      entity && this.props.setValue(entity);
    }
  };

  public render(props: AutocompleteProps<T>): ComponentChild {
    return (
      <datalist id={props.id}>
        {props.options.map(
          t => <option value={getPlaceholder(props.idMapper(t))}>{props.nameMapper(t)}</option>
        )}
      </datalist>
    );
  }
}

export default Autocomplete;
