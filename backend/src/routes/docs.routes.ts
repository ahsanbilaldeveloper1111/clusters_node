import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import spec from '../openapi/openapi.json' with { type: 'json' };

const router = Router();

router.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
router.get('/api/openapi.json', (_req, res) => {
  res.json(spec);
});

export default router;
