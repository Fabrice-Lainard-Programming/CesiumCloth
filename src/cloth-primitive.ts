/*
 * Cesium Cloth Primitive
 * Written by Fabrice Lainard, 2022/2023
 * https://www.flprogramming.fr
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// private & public cesium members
const CesiumJS: any = require('cesiumSource/Cesium');
// associated cloth object
import Cloth from './cloth';

// ------------------------------------------------------------------------------

/**
 * Low level primitive used to draw the cloth with cesium.
 * Note that buffers are not allocated at each change in order to limit the pressure on memory
 */
export class ClothPrimitive {
  /**
   * Associated cloth
   */
  private cloth: Cloth;
  /**
   * Current drawing task
   */
  private drawCommand: any;
  /**
   * flag indicating if a buffer is modified and if it is necessary to restart a drawing task
   */
  private modified = true;
  /**
   * The code executed by the GPU
   */
  private shaderProgram: any;
  /**
   * Cesium / WebGL render state
   */
  private renderState: any;
  /**
   * Attributes used to pack buffers
   */
  private attributes: any;
  /**
   * Position of the particles high bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the high part of the 64 bits word)
   */
  private particlePositionsHigh = new Float32Array(1);
  /**
   * Position of the particles low bits.
   * Data are allocated in a SharedBuffer.
   * The position buffer is compressed for a better rendering precision.
   * (here the low part of the 64 bits word)
   */
  private particlePositionsLow = new Float32Array(1);
  /**
   * List of normals
   */
  private normals: Float32Array;

  /**
   * List of triangles indices
   */
  private indices: Uint16Array;

  /**
   * Triangles indexes
   */
  private indexBuffer: any;

  /**
   * Texture indexes
   */
  private textureCoordinates: Float32Array;

  /**
   * Texture cooordinates as a vertexbuffer
   */
  private textureCoordinatesBuffer: any;

  /**
  * Position of the particles high bits (webgl).
  * The position buffer is compressed for a better rendering precision.
  * (here the high part of the 64 bits word)
  */
  private vertexBufferHigh: any;

  /**
  * Position of the particles low bits (webgl).
  * The position buffer is compressed for a better rendering precision.
  * (here the low part of the 64 bits word)
  */
  private vertexBufferLow: any;


  /**
   * normal webgl  buffer 
   */
  private normalBuffer: any;

  /**
   * Current texture if needed
   */
  private texture: any;

  /**
   * True if texture is actually fetched
   */
  private textureLoading = false;

  /**
   * If the value is true, draw in line
   */
  private wireframe = false;

  /**
   * Bounding sphere of the cloth
   */
  private boundingSphere = new CesiumJS.BoundingSphere(CesiumJS.Cartesian3.ZERO, 1);

  /**
   * Number of particles across the width
   */
  private nbParticlesWidth = 0;

  /**
   * Number of particles along the height
   */
  private nbParticlesHeight = 0;


  /**
   * true if object is deleted
   */
  private _isDestroyed = false;

  static textureCache = new Map<string, any>();

  private textureImage: any;


  /**
   * GPU code used to determine the geometric placement of objects in 3D
   */
  private vertexShaderCode = `
        
        attribute vec3 positionHigh;
        attribute vec3 positionLow;
        attribute vec3 normal;
        attribute vec2 st;
        varying vec2 v_st;
        varying vec3 v_positionEC;
        varying vec3 v_normalEC;
        void main() { 
            vec4 p = czm_translateRelativeToEye(positionHigh, positionLow);
            v_positionEC = (czm_modelViewRelativeToEye  * p).xyz;       // position in eye coordinates
            v_normalEC = czm_normal * normal;                              // normal in eye coordinates
            v_st = st;
            gl_Position = czm_modelViewProjectionRelativeToEye * p;
            
      }`;

  /**
   * GPU based shading (phong) code
   */
  private fragmentShaderCode = `uniform vec4 u_color;
        uniform bool useTexture;
        varying vec3 v_positionEC;
        varying vec3 v_normalEC;

        varying vec2 v_st;
        uniform sampler2D textureImage;


        void main(){
            vec3 positionToEyeEC = normalize(-v_positionEC);
            vec3 normalEC = normalize(v_normalEC);
            #ifdef FACE_FORWARD
                normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);
            #endif

            czm_materialInput materialInput;
            materialInput.normalEC = normalEC;
            materialInput.positionToEyeEC = positionToEyeEC;
            materialInput.st = v_st;
            czm_material material = czm_getDefaultMaterial(materialInput);
            if(useTexture)
            {
                material.diffuse = texture2D(textureImage, materialInput.st).rgb;
             
                //material.diffuse *= vec3(2,2,2);
            }
            else
            {
                material.diffuse = vec3(u_color.x,u_color.y,u_color.z);
                material.alpha = u_color.a;

            }
           // material.specular = 0.2;
            //material.shininess = 0.5;
            //material.alpha = 1.0;
          // material.diffuse *= vec3(1.7,1.7,1.7);
            

            #ifdef FLAT
                gl_FragColor = vec4(material.diffuse + material.emission, material.alpha);
            #else
                gl_FragColor = czm_phong(positionToEyeEC, material,czm_lightDirectionEC);
            #endif
            
            
        }`;

  /**
   * Build the primitive
   * @param cloth
   * @param vertex
   * @param normals
   * @param indices
   */
  public constructor(
    cloth: Cloth,
    particlePositionsHigh: Float32Array,
    particlePositionsLow: Float32Array,
    normals: Float32Array,
    indices: Uint16Array,
    textureCoordinates: Float32Array,
    nbParticlesWidth: number,
    nbParticlesHeight: number,
    textureImage?: any
  ) {
    this.cloth = cloth;
    this.particlePositionsHigh = particlePositionsHigh;
    this.particlePositionsLow = particlePositionsLow;
    this.normals = normals;
    this.indices = indices;
    this.textureCoordinates = textureCoordinates;
    this.nbParticlesHeight = nbParticlesHeight;
    this.nbParticlesWidth = nbParticlesWidth;
    this.textureImage = textureImage;
 
    // if(cloth.debugMode) this.wireframe = true;

    this.boundingSphere = new CesiumJS.BoundingSphere(cloth.center, cloth.radius);
  }

  /**
   * Request to refresh the 3D design using new buffers
   * @param particlePositionsHigh
   * @param particlePositionsLow
   * @param normals
   */
  public refreshBuffers(
    particlePositionsHigh: Float32Array,
    particlePositionsLow: Float32Array,
    normals: Float32Array,
  ) {
    this.particlePositionsHigh = particlePositionsHigh;
    this.particlePositionsLow = particlePositionsLow;
    this.normals = normals;
    this.modified = true;
  }

  /**
   * Picking
   */
  public get allowPicking(): boolean {
    return true;
  }

  /**
   * Bounding sphere
   */
  public get boundingVolume() {
    return this.boundingSphere;
  }

  /**
   * Name of this primitive
   */
  public get name() {
    return 'cloth-' + this.cloth.clothID;
  }

  /**
   * This primitive can be culled
   */
  public get cull() {
    return true;
  }

  public get asynchronous() {
    return false;
  }

  /**
   * If true, this primitive is destroyed
   * @returns
   */
  public isDestroyed() {
    return this._isDestroyed;
  }

  /**
   * Called when destroying this object to remove the memory used by the native objects.
   * @returns
   */
  public destroy() {
    if (this.shaderProgram) {
      this.shaderProgram.destroy();
    }
    if(this.vertexBufferHigh) this.vertexBufferHigh.destroy();
    if(this.vertexBufferLow) this.vertexBufferLow.destroy();
    if(this.indexBuffer) this.indexBuffer.destroy();
    if(this.normalBuffer) this.normalBuffer.destroy();
    this._isDestroyed = true;
    return CesiumJS.destroyObject(this);
  }

  /**
   * Called by Cesium during an update to add our command if it is available
   * @param frameState
   */
  public update(frameState: any) {
    if (this.drawCommand) {
      frameState.commandList.push(this.drawCommand);
    }
    if (this.modified) {
      this.modified = false;
      this.refresh(frameState);
    }
  }

  /**
   * Builds a Command object containing everything needed for the 3D drawing of the cloth
   * @param frameState
   */
  public refresh(frameState: any) {
    const self = this;
    const context = frameState.context;

    // Build texture 
    this.loadTexture(context);

    const uniformMap = {
      u_color() {
        return self.cloth.config.color;
      },
      textureImage: () => {
        if (self.texture) {
          return self.texture;
        } else {
          return context.defaultTexture;
        }
      },
      useTexture: () => {
        return self.cloth.config.useTexture;
      },
    };


    if (!this.indexBuffer) {
      this.indexBuffer = CesiumJS.Buffer.createIndexBuffer({
        context,
        typedArray: this.indices,
        usage: CesiumJS.BufferUsage.STATIC_DRAW,
        indexDatatype: CesiumJS.IndexDatatype.UNSIGNED_SHORT,
      });
    }

    // Build texture coordinates vertex buffer
    if (!this.textureCoordinatesBuffer) {
      this.textureCoordinatesBuffer = CesiumJS.Buffer.createVertexBuffer({
        context,
        typedArray: this.textureCoordinates,
        usage: CesiumJS.BufferUsage.STATIC_DRAW,
      });
    }

    if (!this.normalBuffer) {

      this.normalBuffer = CesiumJS.Buffer.createVertexBuffer({
        context,

        typedArray: this.normals,
        usage: CesiumJS.BufferUsage.STATIC_DRAW,
      });
    }
    else {
      this.normalBuffer._gl.bindBuffer(this.normalBuffer._bufferTarget, this.normalBuffer._buffer);
      this.normalBuffer._gl.bufferData(this.normalBuffer._bufferTarget, this.normals, this.normalBuffer.usage);

    }


    if (!this.vertexBufferHigh) {
      this.vertexBufferHigh = CesiumJS.Buffer.createVertexBuffer({
        context,
        typedArray: this.particlePositionsHigh,
        usage: CesiumJS.BufferUsage.STATIC_DRAW,
      });
    }
    else {
      this.vertexBufferHigh._gl.bindBuffer(this.vertexBufferHigh._bufferTarget, this.vertexBufferHigh._buffer);
      this.vertexBufferHigh._gl.bufferData(this.vertexBufferHigh._bufferTarget, this.particlePositionsHigh, this.vertexBufferHigh.usage);


    }

    if (!this.vertexBufferLow) {
      this.vertexBufferLow = CesiumJS.Buffer.createVertexBuffer({
        context,
        typedArray: this.particlePositionsLow,
        usage: CesiumJS.BufferUsage.STATIC_DRAW,
      });
    }
    else {
      this.vertexBufferLow._gl.bindBuffer(this.vertexBufferLow._bufferTarget, this.vertexBufferLow._buffer);
      this.vertexBufferLow._gl.bufferData(this.vertexBufferLow._bufferTarget, this.particlePositionsLow, this.vertexBufferLow.usage);

    }

    if (!this.attributes) {
      this.attributes = [
        {
          // "position3DHigh",
          index: 0,
          enabled: true,
          vertexBuffer: this.vertexBufferHigh,
          componentsPerAttribute: 3,
          componentDatatype: CesiumJS.ComponentDatatype.FLOAT,
        },
        {
          // "position3DLow",
          index: 1,
          enabled: true,
          vertexBuffer: this.vertexBufferLow,
          componentsPerAttribute: 3,
          componentDatatype: CesiumJS.ComponentDatatype.FLOAT,
        },
        {
          index: 2,
          enabled: true,
          vertexBuffer: this.normalBuffer,
          componentsPerAttribute: 3,
          componentDatatype: CesiumJS.ComponentDatatype.FLOAT,
        },
        {
          index: 3,
          enabled: true,
          vertexBuffer: this.textureCoordinatesBuffer,
          componentsPerAttribute: 2,
          componentDatatype: CesiumJS.ComponentDatatype.FLOAT,
        },
      ];
    } else {
      this.attributes[0].vertexBuffer = this.vertexBufferHigh;
      this.attributes[1].vertexBuffer = this.vertexBufferLow;
      this.attributes[2].vertexBuffer = this.normalBuffer;
      this.attributes[3].vertexBuffer = this.textureCoordinatesBuffer;
    }

    if (!this.shaderProgram) {
      this.shaderProgram = CesiumJS.ShaderProgram.fromCache({
        context,
        vertexShaderSource: this.vertexShaderCode,
        fragmentShaderSource: this.fragmentShaderCode,
      });
    }

    const vertexArray = new CesiumJS.VertexArray({
      context,
      attributes: this.attributes,
      indexBuffer: this.indexBuffer,
    });

    if (!this.renderState) {
      this.renderState = CesiumJS.RenderState.fromCache({
        cull: {
          enabled: false,
          face: CesiumJS.CullFace.FRONT_AND_BACK,
        },
        depthTest: {
          enabled: true,
        },
        depthMask: true,
        blending: CesiumJS.BlendingState.DISABLED,
      });
    }

    const drawCommand = new CesiumJS.DrawCommand({
      vertexArray,
      renderState: this.renderState,
      shaderProgram: this.shaderProgram,
      modelMatrix: CesiumJS.Matrix4.IDENTITY,
      cull: true,
      primitiveType: this.wireframe ? CesiumJS.PrimitiveType.LINE_STRIP : CesiumJS.PrimitiveType.TRIANGLES,
      pass: CesiumJS.Pass.TRANSLUCENT,
      uniformMap,
      boundingVolume: this.boundingVolume,
      owner: this,
      debugShowBoundingVolume: false,
    });

    this.drawCommand = drawCommand;
  }





  /**
   * Load texture 
   * @param context 
   */
  private loadTexture(context: any) {
    const self = this;
    if (!this.textureLoading && !this.texture && this.cloth.config.texturePath && this.textureImage) {

       if (ClothPrimitive.textureCache.has(this.cloth.config.texturePath)) {
        self.texture = ClothPrimitive.textureCache.get(this.cloth.config.texturePath);
         return;
      }
      this.textureLoading = true;
 
       

      if (this.textureImage.internalFormat) {
        self.texture = new CesiumJS.Texture({
          context,
          pixelFormat: this.textureImage.internalFormat,
          width: this.textureImage.width,
          height: this.textureImage.height,
          source: {
            arrayBufferView: this.textureImage.bufferView,
          },
        });
      } else {
        self.texture = new CesiumJS.Texture({
          context,
          source: this.textureImage,
        });
      }
      if (this.cloth.config.texturePath && this.texture) {
        ClothPrimitive.textureCache.set(this.cloth.config.texturePath, this.texture);
      
      }
      self.textureLoading = false;

    }
  }
}
