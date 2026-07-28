import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiDocument } from '../openapi/document.js';

const router = Router();
const spec = getOpenApiDocument();

router.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
router.get('/api/openapi.json', (_req, res) => {
  res.json(getOpenApiDocument());
});

export default router;
