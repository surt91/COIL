import { render } from 'preact';
import './content';
import './ui/styles.css';
import { App } from './ui/App';

render(<App />, document.getElementById('app')!);
