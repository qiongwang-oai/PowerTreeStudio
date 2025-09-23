import { Project } from './models'
import YAML from 'yaml'
import sampleYaml from '../Sample_Server.yaml?raw'

export const sampleProject: Project = YAML.parse(sampleYaml) as any
