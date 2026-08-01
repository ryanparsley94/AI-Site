import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companyRouter from "./company";
import assistantsRouter from "./assistants";
import contactsRouter from "./contacts";
import jobsRouter from "./jobs";
import callsRouter from "./calls";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companyRouter);
router.use(assistantsRouter);
router.use(contactsRouter);
router.use(jobsRouter);
router.use(callsRouter);
router.use(dashboardRouter);

export default router;
