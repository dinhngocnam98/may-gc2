import { Injectable } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as iconv from 'iconv-lite';
import * as getWinShortcut from 'get-windows-shortcut-properties';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Gc5_report } from '../schemas/gc5_report.schema';
import { Gc4_report } from '../schemas/gc4_report.schema';
import { Gc3_report } from '../schemas/gc3_report.schema';
import { Gc2_report } from '../schemas/gc2_report.schema';
import { Gc1_report } from '../schemas/gc1_report.schema';
import { Uv1800_report } from '../schemas/uv1800_report.schema';
import { Uv2600_report } from '../schemas/uv2600_report.schema';
import { Hplc_report } from '../schemas/hplc_report.schema';

@Injectable()
export class ReadReportService {
  constructor(
    @InjectModel(Gc5_report.name) private Gc5_reportModel: Model<Gc5_report>,
    @InjectModel(Gc4_report.name) private Gc4_reportModel: Model<Gc4_report>,
    @InjectModel(Gc3_report.name) private Gc3_reportModel: Model<Gc3_report>,
    @InjectModel(Gc2_report.name) private Gc2_reportModel: Model<Gc2_report>,
    @InjectModel(Gc1_report.name) private Gc1_reportModel: Model<Gc1_report>,
    @InjectModel(Hplc_report.name) private Hplc_reportModel: Model<Hplc_report>,
  ) {}
  errorDir: any[] = [];

  async readFileContents(data: any) {
    const shortcuts = await this.readShortcuts(data);
    if (shortcuts && shortcuts.length > 0) {
      for (const file of shortcuts) {
        if (
          file.toUpperCase().endsWith('.TXT') &&
          file.toUpperCase().includes('REPORT') &&
          !file.toUpperCase().includes('IRREPORT') &&
          !file.toUpperCase().includes('SAVED')
        ) {
          await this.readReport(data, file);
        } else {
          const newFolderPath = {
            folder_dir: data.folder_dir + '/' + file,
            device: data.device,
          };
          await this.readFileContents(newFolderPath);
        }
      }
    }
  }

  async readRoot(dir: string) {
    const rootInfo = fs.readdirSync(dir);
    const rootFilter = rootInfo.filter((item) => item.includes('GC') || item.includes('HPLC'));
    return rootFilter.map((item: string) => {
      if (item.split('.').pop() === 'lnk') {
        const shortcutInfo = getWinShortcut.sync(dir + '/' + item);
        const targetPath = shortcutInfo[0].TargetPath;
        return {
          folder_dir: targetPath.replace(/\\/g, '/'),
          device: item.split('.').shift(),
        };
      }
      return {
        folder_dir: dir + '/' + item,
        device: item,
      };
    });
  }

  private async readShortcuts(data: any) {
    try {
      const stats = await fs.promises.stat(data.folder_dir);
      if (stats.isDirectory()) {
        const indexErrorDir = this.errorDir.findIndex(
          (item) => item.device === data.device,
        );
        if (indexErrorDir !== -1) {
          this.errorDir.splice(indexErrorDir, 1);
        }
        const shortcuts = fs.readdirSync(data.folder_dir);
        return shortcuts.filter((file: string) => file !== '.DS_Store');
      }
    } catch (err) {
      const indexErrorDir = this.errorDir.findIndex(
        (item) => item.device === data.device,
      );
      if (indexErrorDir === -1) {
        this.errorDir.push({
          folder_dir: data.folder_dir,
          device: data.device,
        });
      }
    }
  }
  private async readReport(data: any, file: string) {
    const filePath = `${data.folder_dir}/${file}`;
    const contents = await this.extractSignalData(filePath);
    const isSaved = await this.saveReportDb(contents, data);
    if (isSaved) {
      const newFile = file
        .toLowerCase()
        .replace('.txt', '_saved.txt')
        .toUpperCase();
      fs.rename(`${data.folder_dir}/${file}`, `${data.folder_dir}/${newFile}`);
    }
  }

  // Lưu dữ liệu vào database
  async saveReportDb(contents: any[], data: any) {
    const signalData1 = [];
    const signalData2 = [];
    for (const content of contents) {
      if (content.name_signal.includes('Signal 1')) {
        signalData1.push(content);
      } else signalData2.push(content);
    }
    const result = {
      folder_dir: data.folder_dir,
      signal_1: signalData1,
      signal_2: signalData2,
    };
    try {
      switch (true) {
        case data.device.toUpperCase().includes('GC 5'):
          await this.Gc5_reportModel.create(result);
          break;
        case data.device.toUpperCase().includes('GC 4'):
          await this.Gc4_reportModel.create(result);
          break;
        case data.device.toUpperCase().includes('GC 3'):
          await this.Gc3_reportModel.create(result);
          break;
        case data.device.toUpperCase().includes('GC 2'):
          await this.Gc2_reportModel.create(result);
          break;
        case data.device.toUpperCase().includes('GC 1'):
          await this.Gc1_reportModel.create(result);
          break;
        default:
          throw new Error('Invalid folder for database');
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  //Loc du lieu
  async extractSignalData(filePath: string): Promise<any[]> {
    try {
      const fileBuffer = await fs.readFile(filePath);
      // Convert the file buffer from UTF-16 LE with BOM to UTF-8
      const fileContent = iconv.decode(fileBuffer, 'utf16-le');
      // Extract "Signal" sections
      const signalSections = fileContent.match(/Signal \d+:.+?(Totals :.+?)/gs);
      if (signalSections) {
        return this.parseSignalSections(signalSections);
      } else {
        throw new Error(
          `Signal data not found in the provided text. direct: ${filePath}`,
        );
      }
    } catch (error) {
      throw new Error(`Error reading or processing the file: ${error.message}`);
    }
  }

  parseSignalSections(signalSections: string[]): object[] {
    const parsedData = [];

    for (const signal of signalSections) {
      const lines = signal
        .trim()
        .split('\n')
        .map((line) => line.trim());

      // Extract name_signal
      const nameSignalMatch = lines[0];
      const name_signal = nameSignalMatch ? nameSignalMatch : '';

      // Extract dataRows
      const dataRows = lines.slice(4, -1);
      const signalEntries = dataRows.slice(1).map((row) => {
        const rowSplit = row.split(/\s+/).map((value) => value.trim());
        if (rowSplit.length === 6) {
          const [RetTime, type, Area, Amt_Area, Norm, Name] = rowSplit;
          return {
            name_signal,
            RetTime: parseFloat(RetTime) || null,
            type,
            Area: parseFloat(Area) || null,
            Amt_Area: parseFloat(Amt_Area) || null,
            Norm: parseFloat(Norm) || null,
            Grp: '',
            Name,
          };
        } else {
          const [RetTime, Area, Amt_Area, Norm, Name] = rowSplit;
          return {
            name_signal,
            RetTime: parseFloat(RetTime) || null,
            type: null,
            Area: parseFloat(Area) || null,
            Amt_Area: parseFloat(Amt_Area) || null,
            Norm: parseFloat(Norm) || null,
            Grp: '',
            Name,
          };
        }
      });

      // const totals_norm = lines[lines.length - 1].match(/Totals\s+:\s+(\S+)/);
      // console.log(totals_norm);
      // signalEntries.push({ totals_norm: parseFloat(totals_norm) || 0 });

      parsedData.push(...signalEntries);
    }

    return parsedData;
  }
}
