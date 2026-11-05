// include a few datastructures & constants

#include "video/model.h"
#include "video/video.h"

#include "math.h"
#include "stdio.h"
#include "stdlib.h"
#include "zlib.h"

extern void readMaterialLibrary(char *buf, Mesh *pMesh);
extern void setMaterial(char *buf, Mesh *pMesh, int *iGroup);

void readVector(char *buf, vec3 *pVertex ) {
  if( sscanf(buf, " %f %f %f ", 
	     pVertex->v, pVertex->v + 1, pVertex->v + 2) != 3) {
    fprintf(stderr, "*** failed reading Vector from %s\n", buf);
  }
}

void readTriFace(char *buf, face *pFace, int *iFace, int iGroup) {
  // assumes model in "f %d//%d %d//%d %d//%d\n" format
  if(
     sscanf(buf, "f %d//%d %d//%d %d//%d ",
	    pFace[ *iFace ].vertex + 0, pFace[ *iFace ].normal + 0,
	    pFace[ *iFace ].vertex + 1, pFace[ *iFace ].normal + 1,
	    pFace[ *iFace ].vertex + 2, pFace[ *iFace ].normal + 2) == 6) {
    pFace[ *iFace ].material = iGroup;
    (*iFace)++;
  } else {
    fprintf(stderr, "*** failed parsing face %s\n", buf);
  }
}

void readQuadFace(char *buf, quadFace *pFace, int *iFace, int iGroup) {
// assumes model in "f %d//%d %d//%d %d//%d %d//%d\n" format
  if(
     sscanf(buf, "f %d//%d %d//%d %d//%d %d//%d",
            pFace[ *iFace ].vertex + 0, pFace[ *iFace ].normal + 0,
            pFace[ *iFace ].vertex + 1, pFace[ *iFace ].normal + 1,
            pFace[ *iFace ].vertex + 2, pFace[ *iFace ].normal + 2,
            pFace[ *iFace ].vertex + 3, pFace[ *iFace ].normal + 3) == 8) {
    pFace[ *iFace ].material = iGroup;
    (*iFace)++;
  } else {
    fprintf(stderr, "*** failed parsing face %s\n", buf);
  }
}

Mesh* readMeshFromFile(const char *filename, MeshType iType) {
  // allocate some buffers
  // vertices, normals

  vec3 *pVertices = malloc( sizeof(vec3) * MAX_VERTICES );
  vec3 *pNormals = malloc( sizeof(vec3) * MAX_NORMALS );

  quadFace *pqFaces = NULL;
  face *pFaces = NULL;
  int iFaceSize = 0;

  Mesh *pMesh = malloc( sizeof(Mesh) );
  int iGroup = 0;
  int iVertex = 0, iNormal = 0, iFace = 0;

  gzFile f;
  char buf[BUF_SIZE];

  int i, j, k;


  switch(iType) {
  case TRI_MESH:
    pFaces = malloc( sizeof(face) * MAX_FACES );
    iFaceSize = 3;
    break;
  case QUAD_MESH:
    pqFaces = malloc( sizeof(quadFace) * MAX_FACES );
    iFaceSize = 4;
    break;
  default:
    fprintf(stderr, "[fatal]: illegal mesh type\n");
    exit(1);
  }

  if((f = gzopen(filename, "r")) == 0) {
    fprintf(stderr, "*** could not open file '%s'\n", filename);
    return NULL;
  }

  while( gzgets(f, buf, sizeof(buf)) ) {
    switch(buf[0]) {
    case 'm': // material library
      readMaterialLibrary(buf, pMesh);
      break;
    case 'u': // material  name
      setMaterial(buf, pMesh, &iGroup);
      break;
    case 'v': // vertex, normal, texture coordinate
      switch(buf[1]) {
      case ' ':
	readVector(buf + 1, pVertices + iVertex);
	iVertex++;
	break;
      case 'n': // normal
	readVector(buf + 2, pNormals + iNormal);
	iNormal++;
	break;
      case 't': // texture
	break; // ignore textures;
      }
      break;
    case 'f': // face (can produce multiple faces)
      switch(iType) {
      case TRI_MESH:
	readTriFace(buf, pFaces, &iFace, iGroup);
	break;
      case QUAD_MESH:
	readQuadFace(buf, pqFaces, &iFace, iGroup);
	break;
      }
      break;
    }
  }
  
  gzclose(f);

  // printf("vertices: %d, normals: %d, faces: %d\n", iVertex, iNormal, iFace);

  // count each material
  pMesh->pnFaces = malloc( sizeof(int) * pMesh->nMaterials );
  for(i = 0; i < pMesh->nMaterials; i++) {
    pMesh->pnFaces[ i ] = 0;
  }

  switch(iType) {
  case TRI_MESH:
    for(i = 0; i < iFace; i++) {
      pMesh->pnFaces[ pFaces[i].material ] += 1;
    }
    break;
  case QUAD_MESH:
    for(i = 0; i < iFace; i++) {
      pMesh->pnFaces[ pqFaces[i].material ] += 1;
    }
    break;
  }


  // combine vectors & normals for each vertex, doubling where necessary

  // initialize lookup[ vertex ][ normal ] table
  {
    int nVertices = 0;
    int **lookup = malloc( sizeof(int*) * iVertex );

    for(i = 0; i < iVertex; i++) {
      lookup[i] = malloc( sizeof(int) * iNormal );
      for(j = 0; j < iNormal; j++) {
	lookup[i][j] = -1;
      }
    }
  
    switch(iType) {
    case TRI_MESH:
      for(i = 0; i < iFace; i++) {
	for(j = 0; j < iFaceSize; j++) {
	  int vertex = pFaces[i].vertex[j] - 1;
	  int normal = pFaces[i].normal[j] - 1;
	  if( lookup[ vertex ][ normal ] == -1 ) {
	    lookup[ vertex ][ normal ] = nVertices;
	    nVertices++;
	  }
	}
      }
      break;
    case QUAD_MESH:
      for(i = 0; i < iFace; i++) {
	for(j = 0; j < iFaceSize; j++) {
	  int vertex = pqFaces[i].vertex[j] - 1;
	  int normal = pqFaces[i].normal[j] - 1;
	  if( lookup[ vertex ][ normal ] == -1 ) {
	    lookup[ vertex ][ normal ] = nVertices;
	    nVertices++;
	  }
	}
      }
      break;
    }
  
    // now that we know everything, build vertexarray based mesh
    // copy normals & vertices indexed by lookup-table
    pMesh->nVertices = nVertices;
    pMesh->pVertices = malloc( sizeof(GLfloat) * 3 * nVertices );
    pMesh->pNormals = malloc( sizeof(GLfloat) * 3 * nVertices );
    for(i = 0; i < iVertex; i++) {
      for(j = 0; j < iNormal; j++) {
	int vertex = lookup[ i ][ j ];
	if(vertex != -1 ) {
	  for(k = 0; k < 3; k++) {
	    *(pMesh->pVertices + 3 * vertex + k) = pVertices[ i ].v[k];
	    *(pMesh->pNormals + 3 * vertex + k) = pNormals[ j ].v[k];
	  }
	}
      }
    }

    // build indices (per Material)
    {
      int *face;
      face = malloc( sizeof(int) * pMesh->nMaterials );
      pMesh->ppIndices = malloc( sizeof(GLshort*) * pMesh->nMaterials );
      for(i = 0; i < pMesh->nMaterials; i++) {
	pMesh->ppIndices[i] = 
	  malloc( sizeof(GLshort) * iFaceSize * pMesh->pnFaces[i] );
	face[i] = 0;
      }
      switch(iType) {
      case TRI_MESH:
	for(i = 0; i < iFace; i++) {
	  int material = pFaces[i].material;
	  for(j = 0; j < iFaceSize; j++) {
	    int vertex = pFaces[i].vertex[j] - 1;
	    int normal = pFaces[i].normal[j] - 1;
	    pMesh->ppIndices[ material ][ iFaceSize * face[ material ] + j ] = 
	      lookup[ vertex ][ normal ];
	  }
	  face[ material ] = face[ material] + 1;
	}
	break;
      case QUAD_MESH:
	for(i = 0; i < iFace; i++) {
	  int material = pqFaces[i].material;
	  for(j = 0; j < iFaceSize; j++) {
	    int vertex = pqFaces[i].vertex[j] - 1;
	    int normal = pqFaces[i].normal[j] - 1;
	    pMesh->ppIndices[ material ][ iFaceSize * face[ material ] + j ] = 
	      lookup[ vertex ][ normal ];
	  }
	  face[ material ] = face[ material] + 1;
	}
	break;
      }
      free(face);
    }
    // printf("[scenegraph] vertices: %d, faces: %d\n", nVertices, iFace);

    free(lookup);
    free(pVertices);
    free(pNormals);
    switch(iType) {
    case TRI_MESH:
      free(pFaces);
      break;
    case QUAD_MESH:
      free(pqFaces);
      break;
    }
  }
  computeBBox(pMesh);

  return pMesh;
}

#ifdef __EMSCRIPTEN__
/* Match the web cycle's material lighting for intact and shattered meshes. */
static void webMaterialColor(Material *material, float *n, float *matrix) {
  float nx=matrix[0]*n[0]+matrix[4]*n[1]+matrix[8]*n[2];
  float ny=matrix[1]*n[0]+matrix[5]*n[1]+matrix[9]*n[2];
  float nz=matrix[2]*n[0]+matrix[6]*n[1]+matrix[10]*n[2];
  float length=sqrtf(nx*nx+ny*ny+nz*nz);
  float diffuse=length>0?fmaxf(0,nz/length):0;
  float specular=diffuse>0?powf(diffuse,fmaxf(1,material->shininess)):0;
  float color[4]; int channel;
  for(channel=0;channel<3;++channel)color[channel]=fminf(1,
    material->ambient[channel]*0.25f+material->diffuse[channel]*(0.3f+0.7f*diffuse)+material->specular[channel]*specular*0.65f);
  color[3]=material->diffuse[3]; glColor4fv(color);
}
#endif

void drawModel(Mesh *pMesh, MeshType iType) {
#ifdef __EMSCRIPTEN__
  /* Expand indexed mesh data explicitly. Legacy client-array state can leak
     between singular shadow transforms and subsequent colored mesh draws. */
  {
    int lit = glIsEnabled(GL_LIGHTING), materialIndex, faceIndex, corner;
    int faceSize = iType == TRI_MESH ? 3 : 4;
    float matrix[16];
    glGetFloatv(GL_MODELVIEW_MATRIX, matrix);
    glDisable(GL_LIGHTING);
    glDisable(GL_TEXTURE_2D);
    glDisableClientState(GL_VERTEX_ARRAY);
    glDisableClientState(GL_NORMAL_ARRAY);
    glDisableClientState(GL_COLOR_ARRAY);
    glDisableClientState(GL_TEXTURE_COORD_ARRAY);
    if(iType == QUAD_MESH) {
      /* The recognizer outline uses polygon line mode, absent in WebGL. */
      for(materialIndex=0;materialIndex<pMesh->nMaterials;++materialIndex) {
        glBegin(GL_LINES);
        for(faceIndex=0;faceIndex<pMesh->pnFaces[materialIndex];++faceIndex)
          for(corner=0;corner<4;++corner) {
            unsigned short a=(unsigned short)pMesh->ppIndices[materialIndex][faceIndex*4+corner];
            unsigned short b=(unsigned short)pMesh->ppIndices[materialIndex][faceIndex*4+(corner+1)%4];
            glColor3fv(rec_outline_color); glVertex3fv(&pMesh->pVertices[a*3]);
            glColor3fv(rec_outline_color); glVertex3fv(&pMesh->pVertices[b*3]);
          }
        glEnd();
      }
      if(lit)glEnable(GL_LIGHTING);
      return;
    }
    for(materialIndex=0; materialIndex<pMesh->nMaterials; ++materialIndex) {
      Material *material=&pMesh->pMaterials[materialIndex];
      glBegin(iType == TRI_MESH ? GL_TRIANGLES : GL_QUADS);
      for(faceIndex=0; faceIndex<pMesh->pnFaces[materialIndex]; ++faceIndex) {
        for(corner=0; corner<faceSize; ++corner) {
          unsigned short vertex=(unsigned short)pMesh->ppIndices[materialIndex][faceIndex*faceSize+corner];
          float *n=&pMesh->pNormals[vertex*3];
          if(lit) {
            webMaterialColor(material,n,matrix);
          } else {
            glColor4f(0,0,0,1);
          }
          glVertex3fv(&pMesh->pVertices[vertex*3]);
        }
      }
      glEnd();
      polycount+=pMesh->pnFaces[materialIndex];
    }
    if(lit)glEnable(GL_LIGHTING);
    return;
  }
#else

  int i;
  int iFaceSize = 0;
  GLenum primitive = GL_TRIANGLES;

  glEnableClientState(GL_VERTEX_ARRAY);
  glEnableClientState(GL_NORMAL_ARRAY);
  glVertexPointer(3, GL_FLOAT, 0, pMesh->pVertices);
  glNormalPointer(GL_FLOAT, 0, pMesh->pNormals);

  switch(iType) {
  case TRI_MESH:
    primitive = GL_TRIANGLES;
    iFaceSize = 3;
    break;
  case QUAD_MESH:
    primitive = GL_QUADS;
    iFaceSize = 4;
    break;
  default:
    fprintf(stderr, "[fatal]: illegal mesh type\n");
    exit(1);
  }

  for(i = 0; i < pMesh->nMaterials; i++) {
    glMaterialfv(GL_FRONT, GL_AMBIENT,
		 pMesh->pMaterials[i].ambient);
    glMaterialfv(GL_FRONT, GL_DIFFUSE,
		 pMesh->pMaterials[i].diffuse);
    glMaterialfv(GL_FRONT, GL_SPECULAR,
		 pMesh->pMaterials[i].specular);
    glMaterialfv(GL_FRONT, GL_SHININESS,
		&pMesh->pMaterials[i].shininess);

    glDrawElements(primitive, iFaceSize * pMesh->pnFaces[i],
		   GL_UNSIGNED_SHORT, pMesh->ppIndices[i]);

    polycount += pMesh->pnFaces[i];
  }
  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
#endif
}

void drawModelExplosion(Mesh *pMesh, float fRadius) {
  int i, j, k;
#ifdef __EMSCRIPTEN__
  float matrix[16];
  int lit=glIsEnabled(GL_LIGHTING);
  glGetFloatv(GL_MODELVIEW_MATRIX,matrix);
  glDisable(GL_LIGHTING);
  glDisable(GL_TEXTURE_2D);
  glDisableClientState(GL_VERTEX_ARRAY);
  glDisableClientState(GL_NORMAL_ARRAY);
  glDisableClientState(GL_COLOR_ARRAY);
  glDisableClientState(GL_TEXTURE_COORD_ARRAY);
#endif
#define EXP_VECTORS 10
  float vectors[][3] = {
    { 0.03f, -0.06f, -0.07f }, 
    { 0.04f, 0.08f, -0.03f }, 
    { 0.10f, -0.04f, -0.07f }, 
    { 0.06f, -0.09f, -0.10f }, 
    { -0.03f, -0.05f, 0.02f }, 
    { 0.07f, 0.08f, -0.00f }, 
    { 0.01f, -0.04f, 0.10f }, 
    { -0.01f, -0.07f, 0.09f }, 
    { 0.01f, -0.01f, -0.09f }, 
    { -0.04f, 0.04f, 0.02f }
  };

  for(i = 0; i < pMesh->nMaterials; i++) {
    glMaterialfv(GL_FRONT_AND_BACK, GL_AMBIENT,
        pMesh->pMaterials[i].ambient);
    glMaterialfv(GL_FRONT_AND_BACK, GL_DIFFUSE,
        pMesh->pMaterials[i].diffuse);
    glMaterialfv(GL_FRONT, GL_SPECULAR,
        pMesh->pMaterials[i].specular);
    glMaterialfv(GL_FRONT, GL_SHININESS,
        &pMesh->pMaterials[i].shininess);

#ifdef __EMSCRIPTEN__
    glBegin(GL_TRIANGLES);
#endif
    for(j = 0; j < pMesh->pnFaces[i]; j++) {

      float *normal, *vertex;
#ifdef __EMSCRIPTEN__
      float offset[3];
#endif

      normal = pMesh->pNormals + 3 * pMesh->ppIndices[i][3 * j];

#ifdef __EMSCRIPTEN__
      /* Same fragment trajectories, batched instead of one WebGL draw per face. */
      offset[0]=fRadius*(normal[0]+vectors[j % EXP_VECTORS][0]);
      offset[1]=fRadius*(normal[1]+vectors[j % EXP_VECTORS][1]);
      offset[2]=fabsf(fRadius*(normal[2]+vectors[j % EXP_VECTORS][2]));
#else
      glPushMatrix();
      glTranslatef(fRadius * (*(normal + 0) + vectors[j % EXP_VECTORS][0]),
          fRadius * (*(normal + 1) + vectors[j % EXP_VECTORS][1]),
          fabsf(fRadius * (*(normal + 2) + vectors[j % EXP_VECTORS][2]) ));
      glBegin(GL_TRIANGLES);
#endif
      for(k = 0; k < 3; k++) {
        normal = pMesh->pNormals + 3 * pMesh->ppIndices[i][3 * j + k];
        vertex = pMesh->pVertices + 3 * pMesh->ppIndices[i][3 * j + k];

#ifdef __EMSCRIPTEN__
        webMaterialColor(&pMesh->pMaterials[i],normal,matrix);
        glVertex3f(vertex[0]+offset[0],vertex[1]+offset[1],vertex[2]+offset[2]);
#else
        glNormal3fv(normal);
        glVertex3fv(vertex);
#endif
      }
#ifndef __EMSCRIPTEN__
      glEnd();
      glPopMatrix();
#endif
    }
#ifdef __EMSCRIPTEN__
    glEnd();
#endif
    polycount += pMesh->pnFaces[i];
  }
#ifdef __EMSCRIPTEN__
  if(lit)glEnable(GL_LIGHTING);
#endif
}

void computeBBox(Mesh *pMesh) {
  int i, j;
  vec3 vMin, vMax, vSize;

  vcopy(pMesh->pVertices, vMin.v);
  vcopy(pMesh->pVertices, vMax.v);

  for(i = 0; i < pMesh->nVertices; i++) {
    for(j = 0; j < 3; j++) {
      if(vMin.v[j] > pMesh->pVertices[3 * i + j])
	vMin.v[j] = pMesh->pVertices[3 * i + j];
      if(vMax.v[j] < pMesh->pVertices[3 * i + j])
	vMax.v[j] = pMesh->pVertices[3 * i + j];
    }
    /*
    if(
       vMin.v[0] <= pMesh->pVertices[3 * i + 0] &&
       vMin.v[1] <= pMesh->pVertices[3 * i + 1] &&
       vMin.v[2] <= pMesh->pVertices[3 * i + 2]
       )
      vcopy(pMesh->pVertices + 3 * i, vMin.v);
    if(
       vMax.v[0] >= pMesh->pVertices[3 * i + 0] &&
       vMax.v[1] >= pMesh->pVertices[3 * i + 1] &&
       vMax.v[2] >= pMesh->pVertices[3 * i + 2]
       )
      vcopy(pMesh->pVertices + 3 * i, vMax.v);
    */
  }
  
  vsub(vMax.v, vMin.v, vSize.v);
  vcopy(vMin.v, pMesh->BBox.vMin.v);
  vcopy(vSize.v, pMesh->BBox.vSize.v);
  pMesh->BBox.fRadius=length(pMesh->BBox.vSize.v)/10;
}
