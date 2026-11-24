---
id: grand-continuity-network
name: The Grand Continuity Network
forgeView:
  version: 1
  kind: relationships
  id: grand-continuity-network
  variants:
    main:
      id: main
      name: Power and Trust
      nodes:
        - id: tess
          name: Tess Quill
          x: 340
          y: 220
          reference: tess-quill
        - id: nana
          name: Nana Null
          x: 80
          y: 80
          reference: nana-null
        - id: sol
          name: Captain Sol Ledger
          x: 80
          y: 370
          reference: captain-sol-ledger
        - id: duchess
          name: Duchess Spoiler
          x: 600
          y: 80
          reference: duchess-spoiler
        - id: producer
          name: The Executive Producer
          x: 600
          y: 370
          reference: executive-producer
        - id: ministry
          name: Ministry of Narrative Compliance
          x: 900
          y: 80
          reference: ministry-narrative-compliance
        - id: freeplot
          name: Freeplot Cooperative
          x: 900
          y: 370
          reference: freeplot-cooperative
        - id: studios
          name: Continuity Studios
          x: 900
          y: 650
          reference: continuity-studios
      edges:
        - id: edge-nana-tess
          from:
            kind: node
            nodeId: nana
            port: right
          to:
            kind: node
            nodeId: tess
            port: left
          typeId: mentor
          label: taught her to question prophecies
        - id: edge-tess-sol
          from:
            kind: node
            nodeId: tess
            port: bottom
          to:
            kind: node
            nodeId: sol
            port: top
          typeId: ally
          label: trust built through shared risk
        - id: edge-tess-duchess
          from:
            kind: node
            nodeId: tess
            port: right
          to:
            kind: node
            nodeId: duchess
            port: left
          typeId: rival
          label: compete over Tess's destiny
        - id: edge-ministry-tess
          from:
            kind: node
            nodeId: ministry
            port: left
          to:
            kind: node
            nodeId: tess
            port: top
          typeId: employs
          label: employer
        - id: edge-producer-tess
          from:
            kind: node
            nodeId: producer
            port: left
          to:
            kind: node
            nodeId: tess
            port: bottom
          typeId: pressures
          label: offers a destiny contract
        - id: edge-sol-freeplot
          from:
            kind: node
            nodeId: sol
            port: right
          to:
            kind: node
            nodeId: freeplot
            port: left
          typeId: member
          label: captain and collaborator
        - id: edge-producer-studios
          from:
            kind: node
            nodeId: producer
            port: right
          to:
            kind: node
            nodeId: studios
            port: left
          typeId: employs
          label: executive
      annotations: []
      groups: []
      drawings: []
  relationshipTypes:
    - id: mentor
      name: Mentors
      icon: M
      color: "#8b5cf6"
    - id: ally
      name: Allies
      icon: A
      color: "#10b981"
    - id: rival
      name: Rivals
      icon: R
      color: "#ef4444"
      style: dashed
    - id: employs
      name: Employs
      icon: E
      color: "#3b82f6"
    - id: pressures
      name: Pressures
      icon: P
      color: "#f59e0b"
      style: dotted
    - id: member
      name: Member of
      icon: ∈
      color: "#06b6d4"
---

# The Grand Continuity Network

This relationship map links the core cast to the institutions that employ, support, or pressure them. Select a card to open its canon note.
