
const React = require("react");

export class Shell extends React.Component {
  render() {
    if (this.props.children.length != 2) {
      throw new Error("Shell needs exactly two children (head and body)");
    }
    if (this.props.children[0].type != "head") {
      throw new Error("Shell first child must be <head> (not " + this.props.children[0].type + ")");
    }
    if (this.props.children[1].type != "body") {
      throw new Error("Shell second child must be <body> (not " + this.props.children[1].type + ")");
    }
    return <html prefix="og: http://ogp.me/ns#">
      <head>
        <title>{this.props.title}</title>
        <script src={ this.props.staticLink("js/server-bundle.js") } />
        <link rel="stylesheet" href={ this.props.staticLink("css/styles.css") } />
        <link rel="stylesheet" href={ this.props.staticLink("css/login.css") } />
        {this.props.children[0].props.children}
      </head>
      <body>
        {this.props.children[1].props.children}
      </body>
    </html>;
  }
}
