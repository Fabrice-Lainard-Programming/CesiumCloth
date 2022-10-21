# CesiumCloth
Cesium real-time cloth simulation primitive


See : https://www.flprogramming.fr/index.php/2022/10/17/physical-cloth-simulation-in-cesium/


## To launch the example : clone the repository then :

1. cd sample
2. npm install
3. npm start

## To use cesium-cloth in your project :

npm install cesium-cloth

 
## Add cesium-cloth import


        import Cloth from 'cesium-cloth/lib/cloth'
        import { ClothConfiguration } from 'cesium-cloth'

## Add cesium viewer 

        // cesium viewer
        const viewer: Viewer = new Viewer(this.cesiumContainer.current, {
          selectionIndicator: true,
          animation: false, timeline: false,
          terrainProvider: createWorldTerrain()
        });

## Add cloth configurtion

        const conf0: ClothConfiguration = {
          p1: Cartesian3.fromDegrees(7.7707136, 48.5971652, 300),
          p2: Cartesian3.fromDegrees(7.7722317, 48.5967519, 300),
          p3: Cartesian3.fromDegrees(7.7719393, 48.5963333, 300),
          p4: Cartesian3.fromDegrees(7.7703595, 48.5967253, 300),
          heightAxisParticleDistance: 4,
          widthAxisParticleDistance: 4,
          gravity: Cartesian3.ZERO,
          wind: Cartesian3.ZERO,
          texturePath: '/textures/flag-europe.png',
          color: Color.fromCssColorString("#239409"),
          useTexture: true,
          debugMode: false,
          updateFrequency: 50,
          connectingSecondaryNeighbors: true,
          nbSimulationIterations: 6

        }
   
     

## initialise fixed particles using onInitEvent 

      const onInitEvent = 
        (cloth: Cloth, nbParticlesWidth: number, nbParticlesHeight: number, particlePositions: SharedArrayBuffer) => {

          let fixedStates: ParticleState[] = [];

          // fixed particles on a side of the cloth :
          for (let x = 0; x < nbParticlesWidth; x++) {
            fixedStates.push({
              particleX: x,
              particleY: 0,
              isFixed: true,
            });
          }

          const f0: ClothForceAndCollisionMsg =
          {
            fixedParticles: fixedStates
            wind: new Cartesian3(0.05, 0.04, -0.02),
            gravity: new Cartesian3(0.0, 0.0, -0.9),
          };

          return f0;
        };

## create the cloth

      const cloth0 = new Cloth(viewer, conf0,onInitEvent);
  

