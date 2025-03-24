/* global go */

class ClickHistory {
  constructor () {
    this.history = []
    this.highlights = []
    this.callbacks = []
    this.returneds = []
  }

  subscribe (callback) {
    this.callbacks.push(callback)
  }

  moveUp (pos) {
    if (pos === 0) {
      return
    }
    this.history.splice(pos - 1, 0, ...this.history.splice(pos, 1))
    for (const cb of this.callbacks) {
      cb()
    }
  }

  moveDown (pos) {
    if (pos === this.history.length - 1) {
      return
    }
    this.history.splice(pos + 1, 0, ...this.history.splice(pos, 1))
    for (const cb of this.callbacks) {
      cb()
    }
  }

  updateReturns(pos) {
    this.returneds = this.returneds.map(returned => returned > pos ? returned - 1 : returned)

    this.history = this.history.map(h => {
      if (h[1].type === 'Retorno' && h[1].parameters[0].destination >= pos) {
        return [
          h[0],
          {
            ...h[1],
            parameters: [{
              origin: h[1].parameters[0].origin,
              destination: h[1].parameters[0].destination - 1,
            }]
          },
          h[2],
        ]
      }
      return h
    })
  }

  delete (pos) {
    if (this.returneds.includes(pos)) {
      const posReturn = this.returneds.indexOf(pos)
      this.returneds.splice(posReturn, 1)
    } else if (this.history[pos][1].type === 'Retorno') {
      const posReturn = this.returneds.indexOf(this.history[pos][1].parameters[0].destination)
      this.returneds.splice(posReturn, 1)
    }

    this.history.splice(pos, 1)
    this.updateReturns(pos)

    for (const cb of this.callbacks) {
      cb()
    }
  }

  /*
  data = data object
  obj = TextBlock to highlight
  */
  addHistory (op, data, obj) {
    this.history.push([op, data, obj])
    this.highlights.unshift([op, data, obj])
    if (this.highlights.length === 4) {
      this.highlights.pop()[2].stroke = 'black'
    }
    let i = 250
    for (const e of this.highlights) {
      const c = 'rgb(' + i + ', ' + (250 - (i / 2)) + ', ' + (250 - i) + ')'
      e[2].stroke = c
      i -= 75
    }
    for (const cb of this.callbacks) {
      cb()
    }
  }

  findDestination(i) {
    for(let j = i - 1; j >= 0; j--) {
      if(this.history.at(j)[1].type !== 'Retorno' && !this.returneds.includes(j)) {
        return j
      }
    }

    return -1
  }

  returnFunction(i) {
    const posDestination = this.findDestination(i)

    this.history.push(
      [
        this.history[i][0],
        {
          ...this.history[i][1],
          type: 'Retorno',
          name: 'retorno',
          parameters: [{
            origin: this.history.at(i)[1].className,
            destination: posDestination,
          }]
        },
        this.history[i][2],
      ]
    )

    this.returneds.push(i)

    for (const cb of this.callbacks) {
      cb()
    }
  }
}

// https://gojs.net/latest/samples/umlClass.html
function init (div, clickHistory) {
  const $ = go.GraphObject.make
  const myDiagram =
      $(go.Diagram, div,
        {
          'animationManager.isEnabled': false,
          'undoManager.isEnabled': true,
          layout: $(go.TreeLayout,
            { // this only lays out in trees nodes connected by "generalization" links
              angle: 90,
              path: go.TreeLayout.PathSource, // links go from child to parent
              setsPortSpot: false, // keep Spot.AllSides for link connection spot
              setsChildPortSpot: false, // keep Spot.AllSides
              arrangement: go.TreeLayout.ArrangementHorizontal
            })
        })

  // show visibility or access as a single character at the beginning of each property or method
  function convertVisibility (v) {
    switch (v) {
      case 'public': return '+'
      case 'private': return '-'
      case 'protected': return '#'
      case 'package': return '~'
      default: return v
    }
  }

  function actionDownTemplate (op, level) {
    return (e, btn) => {
      if (!btn.isEnabledObject()) return
      if (e.button !== 0) return
      const text = btn.elt(level) // TextBlockLevel for this entity
      clickHistory.addHistory(op, btn.data, text)
    }
  }

  // the item template for properties
  const propertyTemplate =
      $(go.Panel, 'Horizontal',
        {
          isActionable: true // needed so that the ActionTool intercepts mouse events}
        },
        // property visibility/access
        $(go.TextBlock,
          { isMultiline: false, editable: false, width: 12 },
          new go.Binding('text', 'visibility', convertVisibility)),
        // property name, underlined if scope=="class" to indicate static property
        $(go.TextBlock,
          { isMultiline: false, editable: true },
          new go.Binding('text', 'name').makeTwoWay(),
          new go.Binding('isUnderline', 'scope', function (s) { return s[0] === 'c' })),
        // property type, if known
        $(go.TextBlock, '',
          new go.Binding('text', 'type', function (t) { return (t ? ': ' : '') })),
        $(go.TextBlock,
          { isMultiline: false, editable: true },
          new go.Binding('text', 'type').makeTwoWay()),
        // property default value, if any
        $(go.TextBlock,
          { isMultiline: false, editable: false },
          new go.Binding('text', 'default', function (s) { return s ? ' = ' + s : '' }))
      )

  propertyTemplate.actionDown = actionDownTemplate('attr', 1)

  // the item template for methods
  const methodTemplate =
      $(go.Panel, 'Horizontal',
        {
          isActionable: true // needed so that the ActionTool intercepts mouse events}
        },
        // method visibility/access
        $(go.TextBlock,
          { isMultiline: false, editable: false, width: 12 },
          new go.Binding('text', 'visibility', convertVisibility)),
        // method name, underlined if scope=="class" to indicate static method
        $(go.TextBlock,
          { isMultiline: false, editable: true },
          new go.Binding('text', 'name').makeTwoWay(),
          new go.Binding('isUnderline', 'scope', function (s) { return s[0] === 'c' })),
        // method parameters
        $(go.TextBlock, '()',
          // this does not permit adding/editing/removing of parameters via inplace edits
          new go.Binding('text', 'parameters', function (parr) {
            let s = '('
            for (let i = 0; i < parr.length; i++) {
              const param = parr[i]
              if (i > 0) s += ', '
              s += param.name + ': ' + param.type
            }
            return s + ')'
          })),
        // method return type, if any
        $(go.TextBlock, '',
          new go.Binding('text', 'type', function (t) { return (t ? ': ' : '') })),
        $(go.TextBlock,
          { isMultiline: false, editable: true },
          new go.Binding('text', 'type').makeTwoWay())
      )

  methodTemplate.actionDown = actionDownTemplate('method', 1)

  // this simple template does not have any buttons to permit adding or
  // removing properties or methods, but it could!
  myDiagram.nodeTemplate =
      $(go.Node, 'Auto',
        {
          locationSpot: go.Spot.Center,
          fromSpot: go.Spot.AllSides,
          toSpot: go.Spot.AllSides
        },
        $(go.Shape, { fill: 'lightyellow' }),
        $(go.Panel, 'Table',
          { defaultRowSeparatorStroke: 'black' },
          // header
          $(go.TextBlock,
            {
              row: 0,
              columnSpan: 2,
              margin: 3,
              alignment: go.Spot.Center,
              font: 'bold 12pt sans-serif',
              isMultiline: false,
              editable: true
            },
            new go.Binding('text', 'name').makeTwoWay()),
          // properties
          $(go.TextBlock, 'Properties',
            { row: 1, font: 'italic 10pt sans-serif' },
            new go.Binding('visible', 'visible', function (v) { return !v }).ofObject('PROPERTIES')),
          $(go.Panel, 'Vertical', { name: 'PROPERTIES' },
            new go.Binding('itemArray', 'properties'),
            {
              row: 1,
              margin: 3,
              stretch: go.GraphObject.Fill,
              defaultAlignment: go.Spot.Left,
              background: 'lightyellow',
              itemTemplate: propertyTemplate
            }
          ),
          $('PanelExpanderButton', 'PROPERTIES',
            { row: 1, column: 1, alignment: go.Spot.TopRight, visible: false },
            new go.Binding('visible', 'properties', function (arr) { return arr.length > 0 })),
          // methods
          $(go.TextBlock, 'Methods',
            { row: 2, font: 'italic 10pt sans-serif' },
            new go.Binding('visible', 'visible', function (v) { return !v }).ofObject('METHODS')),
          $(go.Panel, 'Vertical', { name: 'METHODS' },
            new go.Binding('itemArray', 'methods'),
            {
              row: 2,
              margin: 3,
              stretch: go.GraphObject.Fill,
              defaultAlignment: go.Spot.Left,
              background: 'lightyellow',
              itemTemplate: methodTemplate
            }
          ),
          $('PanelExpanderButton', 'METHODS',
            { row: 2, column: 1, alignment: go.Spot.TopRight, visible: false },
            new go.Binding('visible', 'methods', function (arr) { return arr.length > 0 }))
        )
      )

  function convertIsTreeLink (r) {
    return r && r.length > 0
  }

  function convertFromArrow (r) {
    return ''
  }

  function convertToArrow (r) {
    switch (r) {
      case 'generalization': return 'Triangle'
      case 'generalizationInterface': return 'Triangle'
      case 'aggregation': return 'StretchedDiamond'
      case 'composition': return 'StretchedDiamond'
      case 'directionalAssociation': return 'OpenTriangle'
      case 'association': return ''
      default: return ''
    }
  }

  function fillToArrow (r) {
    switch (r) {
      case 'generalizationInterface': return 'black'
      case 'composition': return 'black'
      default: return 'white'
    }
  }

  myDiagram.linkTemplate =
      $(go.Link,
        {
          routing: go.Link.AvoidsNodes, // may be either Orthogonal or AvoidsNodes
          curve: go.Link.JumpOver
        },
        new go.Binding('isLayoutPositioned', 'relationship', convertIsTreeLink),
        $(go.Shape),
        $(go.Shape, { scale: 1.3, fill: 'white' },
          new go.Binding('fromArrow', 'relationship', convertFromArrow)),
        $(go.Shape, { scale: 1.3 },
          new go.Binding('toArrow', 'relationship', convertToArrow),
          new go.Binding('fill', 'relationship', fillToArrow)),
        $(go.TextBlock, { segmentIndex: -1, segmentFraction: 0.5, segmentOffset: new go.Point(NaN, NaN) },
          new go.Binding("text", "cardFrom")
        ),
        $(go.TextBlock, { segmentIndex: 0, segmentFraction: 0.5, segmentOffset: new go.Point(NaN, NaN) },
          new go.Binding("text", "cardTo")
        ),
      )
  return myDiagram
}

function create (myDiagram, nodedata, linkdata) {
  const $ = go.GraphObject.make
  myDiagram.model = $(go.GraphLinksModel,
    {
      copiesArrays: true,
      copiesArrayObjects: true,
      nodeDataArray: nodedata,
      linkDataArray: linkdata
    })
}

export { init, create, ClickHistory }
